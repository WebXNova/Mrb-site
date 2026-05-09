import crypto from 'crypto';
import { mysqlPool } from '../config/mysql.js';
import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { sendEmail } from './email.service.js';

const resendBuckets = new Map();
const strictTokenRegex = /^[a-f0-9]{64}$/i;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeIp(ipAddress) {
  return String(ipAddress || '').trim() || null;
}

function normalizeUserAgent(userAgent) {
  const value = String(userAgent || '').trim();
  return value ? value.slice(0, 300) : null;
}

function toIpFingerprint(ipAddress) {
  if (!ipAddress) return '';
  if (ipAddress.includes(':')) return ipAddress.split(':').slice(0, 4).join(':');
  return ipAddress.split('.').slice(0, 3).join('.');
}

function hasContextMismatch(issuedIp, issuedUserAgent, verifiedIp, verifiedUserAgent) {
  const ipMismatch = Boolean(issuedIp && verifiedIp && toIpFingerprint(issuedIp) !== toIpFingerprint(verifiedIp));
  const uaMismatch =
    Boolean(issuedUserAgent && verifiedUserAgent) &&
    issuedUserAgent.slice(0, 80).toLowerCase() !== verifiedUserAgent.slice(0, 80).toLowerCase();
  return { ipMismatch, uaMismatch, mismatch: ipMismatch || uaMismatch };
}

function buildVerifyLink(rawToken) {
  const base = String(env.clientUrl || '').replace(/\/+$/, '');
  return `${base}/verify-email?token=${rawToken}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildVerificationEmail({ fullName, verifyLink, ttlMinutes }) {
  const safeName = escapeHtml(fullName ? String(fullName).trim() : 'Student');
  const safeLink = escapeHtml(verifyLink);
  const subject = 'Verify your email address';
  const text = [
    `Hi ${String(fullName || 'Student').trim() || 'Student'},`,
    '',
    'Please verify your email address by opening the link below:',
    verifyLink,
    '',
    `This link expires in ${ttlMinutes} minutes.`,
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5;">
      <p>Hi ${safeName},</p>
      <p>Please verify your email address by clicking the button below:</p>
      <p>
        <a href="${safeLink}" style="display:inline-block;padding:10px 14px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;">
          Verify Email
        </a>
      </p>
      <p>If the button does not work, copy this link into your browser:</p>
      <p><a href="${safeLink}">${safeLink}</a></p>
      <p>This link expires in ${ttlMinutes} minutes.</p>
    </div>
  `;
  return { subject, text, html };
}

async function consumeBucket(key, windowMs, limit) {
  const redis = getRedisClient();
  if (redis) {
    const total = await redis.incr(key);
    if (total === 1) await redis.pExpire(key, windowMs);
    return total <= limit;
  }
  const now = Date.now();
  const entry = resendBuckets.get(key) || { count: 0, startedAt: now };
  if (now - entry.startedAt > windowMs) {
    entry.count = 0;
    entry.startedAt = now;
  }
  entry.count += 1;
  resendBuckets.set(key, entry);
  return entry.count <= limit;
}

async function assertResendAllowed({ userId }) {
  const redis = getRedisClient();
  const cooldownKey = `resend:${userId}`;
  if (redis) {
    const cooldownTtl = await redis.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      throw new ApiError(429, 'Please wait before requesting another verification email');
    }
  } else {
    const cooldown = resendBuckets.get(cooldownKey);
    if (cooldown && Date.now() < cooldown.expiresAt) {
      throw new ApiError(429, 'Please wait before requesting another verification email');
    }
  }

  const hourKey = `verify:resend:hour:${userId}`;
  const hourlyOk = await consumeBucket(hourKey, 60 * 60 * 1000, env.verification.resendMaxPerHour);
  if (!hourlyOk) {
    throw new ApiError(429, 'Too many verification resend attempts');
  }

  if (redis) {
    await redis.set(cooldownKey, '1', { EX: env.verification.resendCooldownSeconds });
  } else {
    resendBuckets.set(cooldownKey, { expiresAt: Date.now() + env.verification.resendCooldownSeconds * 1000 });
  }
}

async function upsertVerificationToken({
  userId,
  connection,
  issuedIp = null,
  issuedUserAgent = null,
}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMinutes = Math.max(10, Math.min(15, Number(env.verification.tokenTtlMinutes || 15)));
  await connection.query(
    `UPDATE email_verifications
     SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
     WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()`,
    [userId]
  );
  await connection.query(
    `INSERT INTO email_verifications (
      user_id, token_hash, expires_at, used_at, issued_ip, issued_user_agent
    )
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL, ?, ?)`,
    [userId, tokenHash, ttlMinutes, issuedIp, issuedUserAgent]
  );
  return { rawToken, ttlMinutes };
}

async function assertNotSuppressedEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return;
  const [rows] = await mysqlPool.query(
    `SELECT id
     FROM email_suppressions
     WHERE email = ? AND active = TRUE
     LIMIT 1`,
    [normalized]
  );
  if (rows[0]) {
    throw new ApiError(429, 'Email delivery unavailable for this recipient');
  }
}

export async function createAndSendVerificationToken({
  userId,
  email,
  fullName,
  ipAddress = null,
  userAgent = null,
  reason = 'signup',
}) {
  const connection = await mysqlPool.getConnection();
  const issuedIp = normalizeIp(ipAddress);
  const issuedUserAgent = normalizeUserAgent(userAgent);
  try {
    await assertNotSuppressedEmail(email);
    await connection.beginTransaction();
    const { rawToken, ttlMinutes } = await upsertVerificationToken({
      userId,
      connection,
      issuedIp,
      issuedUserAgent,
    });
    await connection.commit();
    const verifyLink = buildVerifyLink(rawToken);
    const msg = buildVerificationEmail({ fullName, verifyLink, ttlMinutes });
    await sendEmail({ to: email, subject: msg.subject, html: msg.html, text: msg.text, userId });
    await mysqlPool.query(
      `UPDATE users
       SET last_verification_sent_at = CURRENT_TIMESTAMP,
           verification_send_failures = 0
       WHERE id = ?`,
      [userId]
    );
    await logActivity({
      userId,
      role: 'student',
      action: 'verification.token_created',
      entityType: 'auth',
      metadata: { reason, email, issuedIp, issuedUserAgent },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    await mysqlPool.query(
      `UPDATE users
       SET verification_send_failures = verification_send_failures + 1
       WHERE id = ?`,
      [userId]
    );
    await logActivity({
      userId,
      role: 'student',
      action: 'verification.delivery_failed',
      entityType: 'auth',
      metadata: { reason, message: error.message },
    });
    throw error;
  } finally {
    connection.release();
  }
}

export function validateVerificationTokenShape(rawToken) {
  const token = String(rawToken || '').trim();
  if (!strictTokenRegex.test(token)) {
    throw new ApiError(400, 'Invalid or expired verification link');
  }
  return token.toLowerCase();
}

export async function verifyEmailByToken({ rawToken, ipAddress = null, userAgent = null }) {
  const token = validateVerificationTokenShape(rawToken);
  const tokenHash = hashToken(token);
  const verifiedIp = normalizeIp(ipAddress);
  const verifiedUserAgent = normalizeUserAgent(userAgent);
  console.log('[verify-email] DB lookup start', {
    tokenHashPrefix: tokenHash.slice(0, 12),
    ipAddress: verifiedIp,
  });

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id, user_id, expires_at, used_at, issued_ip, issued_user_agent
       FROM email_verifications
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );
    const row = rows[0];
    if (!row) {
      console.warn('[verify-email] DB lookup result', { found: false, tokenHashPrefix: tokenHash.slice(0, 12) });
      await connection.rollback();
      await logActivity({
        role: 'student',
        action: 'verification.failed_invalid',
        entityType: 'auth',
        metadata: { ipAddress: verifiedIp },
      });
      throw new ApiError(400, 'Invalid or expired verification link');
    }
    console.log('[verify-email] DB lookup result', { found: true, verificationId: row.id, userId: row.user_id });

    await connection.query(`UPDATE users SET is_verified = TRUE, token_version = token_version + 1 WHERE id = ?`, [row.user_id]);
    await connection.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE user_id = ?`,
      [row.user_id]
    );
    await connection.query(
      `UPDATE email_verifications
       SET used_at = CURRENT_TIMESTAMP, verified_ip = ?, verified_user_agent = ?
       WHERE id = ?`,
      [verifiedIp, verifiedUserAgent, row.id]
    );
    await connection.commit();

    const mismatch = hasContextMismatch(row.issued_ip, row.issued_user_agent, verifiedIp, verifiedUserAgent);
    if (mismatch.mismatch) {
      await logActivity({
        userId: row.user_id,
        role: 'student',
        action: 'verification.anomaly_ip_ua_mismatch',
        entityType: 'auth',
        metadata: { ...mismatch, issuedIp: row.issued_ip, verifiedIp },
      });
    }
    await logActivity({
      userId: row.user_id,
      role: 'student',
      action: 'verification.success',
      entityType: 'auth',
      metadata: { ipAddress: verifiedIp },
    });
    await logActivity({
      userId: row.user_id,
      role: 'student',
      action: 'verification.success.session_revoke_all',
      entityType: 'auth',
      metadata: { ipAddress: verifiedIp },
    });
    return { success: true, userId: row.user_id };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function resendVerificationEmail({
  userId,
  email,
  fullName,
  ipAddress = null,
  userAgent = null,
}) {
  await assertResendAllowed({ userId });
  await createAndSendVerificationToken({
    userId,
    email,
    fullName,
    ipAddress,
    userAgent,
    reason: 'resend',
  });
}

