import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { getEmailQueue } from '../config/queue.js';
import { logActivity } from './activityLog.service.js';
import { mysqlPool } from '../config/mysql.js';

let transporter = null;
let sendgridInitialized = false;

function usingSendGrid() {
  return env.email.provider === 'sendgrid';
}

class EmailDeliveryError extends Error {
  constructor(message, { retryable = true, provider = 'unknown', statusCode = null, details = null } = {}) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.retryable = retryable;
    this.provider = provider;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** SendGrid v3 expects a parseable email in `from.email`; use explicit `{ email, name? }`. */
function buildSendGridMailFrom(raw) {
  const trimmed = String(raw || '').trim();
  const lastLt = trimmed.lastIndexOf('<');
  const lastGt = trimmed.lastIndexOf('>');
  if (lastLt !== -1 && lastGt > lastLt) {
    const email = trimmed.slice(lastLt + 1, lastGt).trim();
    const name = trimmed
      .slice(0, lastLt)
      .trim()
      .replace(/^["']+|["']+$/g, '')
      .trim();
    if (email.includes('@')) {
      return name ? { email, name } : { email };
    }
  }
  return { email: trimmed };
}

function extractConfiguredFromEmail(raw) {
  return buildSendGridMailFrom(raw).email;
}

function assertEmailConfig() {
  if (!env.email.from) {
    throw new ApiError(503, 'Email service is not configured');
  }
  if (
    usingSendGrid() &&
    !extractConfiguredFromEmail(env.email.from).includes('@')
  ) {
    throw new ApiError(
      503,
      'EMAIL_FROM must be a valid sender address (e.g. you@verified-domain.com)'
    );
  }
  if (usingSendGrid() && !env.email.sendgridApiKey) {
    throw new ApiError(503, 'SendGrid is not configured');
  }
  if (!usingSendGrid() && (!env.email.host || !env.email.port || !env.email.user || !env.email.pass)) {
    throw new ApiError(503, 'SMTP email service is not configured');
  }
}

function initSendGrid() {
  if (sendgridInitialized) return;
  assertEmailConfig();
  sgMail.setApiKey(env.email.sendgridApiKey);
  sendgridInitialized = true;
  console.log('[email] SendGrid client initialized');
}

function getTransporter() {
  if (transporter) return transporter;
  assertEmailConfig();
  transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure,
    auth: {
      user: env.email.user,
      pass: env.email.pass,
    },
  });
  return transporter;
}

function extractSendgridErrorDetails(error) {
  const statusCode = Number(error?.code || error?.response?.statusCode || error?.response?.status || 0) || null;
  const providerBody = error?.response?.body;
  const providerErrors = Array.isArray(providerBody?.errors)
    ? providerBody.errors.map((entry) => ({
        message: String(entry?.message || '').slice(0, 255),
        field: entry?.field || null,
        help: entry?.help || null,
      }))
    : [];
  return {
    statusCode,
    providerErrors,
    responseBody: providerBody || null,
  };
}

function classifySendgridError(error) {
  const details = extractSendgridErrorDetails(error);
  const statusCode = details.statusCode;
  const providerMessage = details.providerErrors[0]?.message || error?.message || 'sendgrid_delivery_failed';
  const isRetryable = !statusCode || statusCode >= 500 || statusCode === 429;
  return new EmailDeliveryError(providerMessage, {
    retryable: isRetryable,
    provider: 'sendgrid',
    statusCode,
    details,
  });
}

export function isTerminalEmailError(error) {
  if (error instanceof EmailDeliveryError) {
    return !error.retryable;
  }
  return false;
}

export function getEmailProviderStatus() {
  return {
    provider: env.email.provider,
    fromConfigured: Boolean(env.email.from),
    sendgridConfigured: Boolean(env.email.sendgridApiKey),
    smtpConfigured: Boolean(env.email.host && env.email.port && env.email.user && env.email.pass),
    sendgridInitialized,
  };
}

export async function sendEmailNow({ to, subject, html, text, outboxId = null, userId = null }) {
  assertEmailConfig();
  console.log('[email] Delivery attempt started', {
    provider: env.email.provider,
    to,
    outboxId,
    userId,
  });
  if (usingSendGrid()) {
    try {
      initSendGrid();
      const [response] = await sgMail.send({
        to,
        from: buildSendGridMailFrom(env.email.from),
        subject,
        html,
        text,
        mailSettings: {
          sandboxMode: {
            enable: env.email.sendgridSandboxMode,
          },
        },
      });
      console.log('[email] SendGrid accepted message', {
        to,
        outboxId,
        statusCode: Number(response?.statusCode || 0) || null,
        headersPresent: Boolean(response?.headers),
      });
      return;
    } catch (error) {
      const classified = classifySendgridError(error);
      console.error('[email] SendGrid rejected message', {
        to,
        outboxId,
        statusCode: classified.statusCode,
        retryable: classified.retryable,
        reason: classified.message,
        providerErrors: classified.details?.providerErrors || [],
        responseBody: classified.details?.responseBody || null,
      });
      throw classified;
    }
  }
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: env.email.from,
      to,
      subject,
      html,
      text,
    });
  } catch (error) {
    throw new EmailDeliveryError(error?.message || 'smtp_delivery_failed', {
      retryable: true,
      provider: 'smtp',
      statusCode: Number(error?.responseCode || 0) || null,
    });
  }
}

export async function sendEmail({ to, subject, html, text, userId = null }) {
  const [outboxResult] = await mysqlPool.query(
    `INSERT INTO email_outbox (user_id, template, recipient_email, payload_json, status)
     VALUES (?, 'verification', ?, ?, 'queued')`,
    [userId, to, JSON.stringify({ to, subject, html, text })]
  );
  const outboxId = Number(outboxResult.insertId);
  const queue = getEmailQueue();
  if (!queue) {
    console.warn('[email] Queue unavailable, using direct send fallback', { outboxId, to });
    try {
      await sendEmailNow({ to, subject, html, text, outboxId, userId });
      await mysqlPool.query(`UPDATE email_outbox SET status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [outboxId]);
      await logActivity({
        userId,
        role: userId ? 'student' : 'system',
        action: usingSendGrid() ? 'email.sendgrid.accepted' : 'email.smtp.accepted',
        entityType: 'email',
        metadata: { to, outboxId, provider: env.email.provider },
      });
    } catch (error) {
      await mysqlPool.query(
        `UPDATE email_outbox
         SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [String(error.message || 'delivery_failed').slice(0, 255), outboxId]
      );
      await logActivity({
        userId,
        role: userId ? 'student' : 'system',
        action: usingSendGrid() ? 'email.sendgrid.rejected' : 'email.smtp.rejected',
        entityType: 'email',
        metadata: {
          to,
          outboxId,
          provider: error?.provider || env.email.provider,
          retryable: isTerminalEmailError(error) ? false : true,
          statusCode: error?.statusCode || null,
          reason: String(error?.message || 'delivery_failed').slice(0, 255),
          providerDetails: error?.details?.providerErrors || null,
        },
      });
      throw error;
    }
    return;
  }
  await queue.add(
    'send-email',
    { to, subject, html, text, userId, outboxId },
    {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1500 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    }
  );
  await logActivity({
    userId,
    role: userId ? 'student' : 'system',
    action: 'email.queued',
    entityType: 'email',
    metadata: { to, outboxId },
  });
}

