import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { mysqlPool } from '../config/mysql.js';
import { getRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { logActivity } from './activityLog.service.js';
import { sendEmail } from './email.service.js';

const strictTokenRegex = /^[a-f0-9]{64}$/i;
const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset link';
const resetBuckets = new Map();

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

function hasContextMismatch(issuedIp, issuedUserAgent, consumedIp, consumedUserAgent) {
  const ipMismatch = Boolean(issuedIp && consumedIp && toIpFingerprint(issuedIp) !== toIpFingerprint(consumedIp));
  const uaMismatch =
    Boolean(issuedUserAgent && consumedUserAgent) &&
    issuedUserAgent.slice(0, 80).toLowerCase() !== consumedUserAgent.slice(0, 80).toLowerCase();
  return { ipMismatch, uaMismatch, mismatch: ipMismatch || uaMismatch };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildResetLink(rawToken) {
  const base = String(env.clientUrl || '').replace(/\/+$/, '');
  return `${base}/reset-password?token=${rawToken}`;
}

function siteLabelFromClientUrl() {
  try {
    const host = new URL(env.clientUrl || 'http://localhost').hostname;
    return host.replace(/^www\./i, '') || 'MRB Learning';
  } catch {
    return 'MRB Learning';
  }
}

export function buildPasswordResetEmail({ fullName, resetLink, ttlMinutes }) {
  const displayName = String(fullName || 'Student').trim() || 'Student';
  const safeName = escapeHtml(displayName);
  const safeLink = escapeHtml(resetLink);
  const siteLabel = escapeHtml(siteLabelFromClientUrl());
  const clientUrl = escapeHtml(String(env.clientUrl || '').replace(/\/+$/, ''));
  const supportUrl = escapeHtml(`${String(env.clientUrl || '').replace(/\/+$/, '')}/contact`);
  const fromAddress = escapeHtml(String(env.email.from || '').trim());
  const ttl = Number(ttlMinutes || env.passwordReset.tokenTtlMinutes || 45);
  const subject = 'Reset your password';
  const text = [
    `Hi ${displayName},`,
    '',
    'We received a request to reset your password.',
    '',
    'Reset your password by opening the link below:',
    resetLink,
    '',
    `This link expires in ${ttl} minutes and can only be used once.`,
    'After it expires, you must request a new reset link.',
    '',
    'Security notice:',
    '- If you did not request this, you can safely ignore this email. Your password will not change.',
    '- We will never ask for your password, verification codes, or this link by email or phone.',
    fromAddress ? `- Official emails come from: ${String(env.email.from || '').trim()}` : '',
    clientUrl ? `- Official website: ${String(env.clientUrl || '').replace(/\/+$/, '')}` : '',
    '- Do not reply to this email.',
    '',
    `Need help? Visit our contact page: ${String(env.clientUrl || '').replace(/\/+$/, '')}/contact`,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; line-height:1.5; max-width:600px; margin:0 auto; font-size:16px;">
      <span style="display:none; max-height:0; overflow:hidden; opacity:0;">Reset your password — link expires in ${ttl} minutes</span>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your password for ${siteLabel}.</p>
      <p>
        <a href="${safeLink}" style="display:inline-block;padding:14px 20px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;min-height:44px;line-height:1.2;">
          Reset Password
        </a>
      </p>
      <p>If the button does not work, copy this link into your browser:</p>
      <p><a href="${safeLink}">${safeLink}</a></p>
      <p>This link expires in <strong>${ttl} minutes</strong> and can only be used once. After it expires, you must request a new reset link.</p>
      <p><strong>Security notice</strong></p>
      <ul>
        <li>If you did not request this, you can safely ignore this email. Your password will not change.</li>
        <li>We will never ask for your password, verification codes, or this link by email or phone.</li>
        ${fromAddress ? `<li>Official emails come from: ${fromAddress}</li>` : ''}
        ${clientUrl ? `<li>Official website: <a href="${clientUrl}">${clientUrl}</a></li>` : ''}
        <li>Do not reply to this email.</li>
      </ul>
      <p>Need help? Visit our <a href="${supportUrl}">contact page</a>.</p>
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
  const entry = resetBuckets.get(key) || { count: 0, startedAt: now };
  if (now - entry.startedAt > windowMs) {
    entry.count = 0;
    entry.startedAt = now;
  }
  entry.count += 1;
  resetBuckets.set(key, entry);
  return entry.count <= limit;
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

async function assertResetRequestAllowed({ userId }) {
  const redis = getRedisClient();
  const cooldownKey = `pwdreset:cooldown:${userId}`;
  if (redis) {
    const cooldownTtl = await redis.ttl(cooldownKey);
    if (cooldownTtl > 0) {
      throw new ApiError(429, 'Please wait before requesting another password reset email');
    }
  } else {
    const cooldown = resetBuckets.get(cooldownKey);
    if (cooldown && Date.now() < cooldown.expiresAt) {
      throw new ApiError(429, 'Please wait before requesting another password reset email');
    }
  }

  const hourKey = `pwdreset:hour:${userId}`;
  const hourlyOk = await consumeBucket(hourKey, 60 * 60 * 1000, env.passwordReset.maxPerEmailPerHour);
  if (!hourlyOk) {
    throw new ApiError(429, 'Too many password reset attempts');
  }

  if (redis) {
    await redis.set(cooldownKey, '1', { EX: env.passwordReset.cooldownSeconds });
  } else {
    resetBuckets.set(cooldownKey, { expiresAt: Date.now() + env.passwordReset.cooldownSeconds * 1000 });
  }
}

export async function createAndSendPasswordResetToken({
  userId,
  email,
  fullName,
  ipAddress = null,
  userAgent = null,
  reason = 'forgot_password',
}) {
  const connection = await mysqlPool.getConnection();
  const issuedIp = normalizeIp(ipAddress);
  const issuedUserAgent = normalizeUserAgent(userAgent);
  try {
    await assertNotSuppressedEmail(email);
    await assertResetRequestAllowed({ userId });
    await connection.beginTransaction();
    const { rawToken, ttlMinutes } = await createPasswordResetToken({
      userId,
      connection,
      issuedIp,
      issuedUserAgent,
    });
    await connection.commit();
    // eslint-disable-next-line no-console
    console.log('Token created');
    const resetLink = buildResetLink(rawToken);
    const msg = buildPasswordResetEmail({ fullName, resetLink, ttlMinutes });
    await sendEmail({
      to: email,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      userId,
      template: 'password_reset',
    });
    // eslint-disable-next-line no-console
    console.log('Email queued');
    await logActivity({
      userId,
      role: 'student',
      action: 'password_reset.token_created',
      entityType: 'auth',
      metadata: { reason, issuedIp, issuedUserAgent },
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // ignore rollback errors
    }
    const action =
      String(error?.message || '').includes('suppression') ||
      String(error?.message || '').includes('unavailable for this recipient')
        ? 'password_reset.delivery_blocked'
        : String(error?.message || '').includes('wait before') ||
            String(error?.message || '').includes('Too many password reset')
          ? 'password_reset.request_rate_limited'
          : 'password_reset.delivery_failed';
    await logActivity({
      userId,
      role: 'student',
      action,
      entityType: 'auth',
      metadata: { reason, message: error.message },
    });
    throw error;
  } finally {
    connection.release();
  }
}

export function validatePasswordResetTokenShape(rawToken) {
  const token = String(rawToken || '').trim();
  if (!strictTokenRegex.test(token)) {
    throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);
  }
  return token.toLowerCase();
}

/**
 * Marks all active reset tokens for a user as used (superseded).
 * @param {{ userId: number|string, connection: import('mysql2/promise').PoolConnection }} params
 */
export async function invalidatePreviousResetTokens({ userId, connection }) {
  await connection.query(
    `UPDATE password_reset_tokens
     SET used_at = COALESCE(used_at, CURRENT_TIMESTAMP)
     WHERE user_id = ? AND used_at IS NULL AND expires_at > NOW()`,
    [userId]
  );
}

/**
 * Creates a new password reset token row after invalidating prior active tokens.
 * @returns {{ rawToken: string, tokenHash: string, ttlMinutes: number }}
 */
export async function createPasswordResetToken({
  userId,
  connection,
  issuedIp = null,
  issuedUserAgent = null,
}) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMinutes = Number(env.passwordReset.tokenTtlMinutes || 45);

  await invalidatePreviousResetTokens({ userId, connection });
  await connection.query(
    `INSERT INTO password_reset_tokens (
      user_id, token_hash, expires_at, used_at, issued_ip, issued_user_agent
    )
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL, ?, ?)`,
    [userId, tokenHash, ttlMinutes, issuedIp, issuedUserAgent]
  );

  return { rawToken, tokenHash, ttlMinutes };
}

/**
 * Finds an active reset token row. When forUpdate is true, locks the row for consumption.
 * @returns {Promise<object|null>}
 */
export async function findValidResetToken({ rawToken, connection, forUpdate = false }) {
  const token = validatePasswordResetTokenShape(rawToken);
  const tokenHash = hashToken(token);
  const lockClause = forUpdate ? ' FOR UPDATE' : '';
  const [rows] = await connection.query(
    `SELECT id, user_id, expires_at, used_at, issued_ip, issued_user_agent
     FROM password_reset_tokens
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1${lockClause}`,
    [tokenHash]
  );
  return rows[0] || null;
}

/**
 * Consumes a reset token and supersedes any remaining active tokens for the user.
 */
export async function consumePasswordResetToken({
  tokenId,
  userId,
  consumedIp = null,
  consumedUserAgent = null,
  connection,
}) {
  await connection.query(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP, consumed_ip = ?, consumed_user_agent = ?
     WHERE id = ?`,
    [consumedIp, consumedUserAgent, tokenId]
  );
  await invalidatePreviousResetTokens({ userId, connection });
}

/**
 * Atomically resets a student password: validate token, update hash, bump token_version,
 * revoke all sessions, consume token.
 */
export async function resetStudentPassword({ rawToken, newPassword, ipAddress = null, userAgent = null }) {
  const consumedIp = normalizeIp(ipAddress);
  const consumedUserAgent = normalizeUserAgent(userAgent);
  const passwordHash = await bcrypt.hash(String(newPassword || ''), 10);

  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();

    const tokenRow = await findValidResetToken({ rawToken, connection, forUpdate: true });
    if (!tokenRow) {
      await connection.rollback();
      await logActivity({
        role: 'student',
        action: 'password_reset.failed_invalid',
        entityType: 'auth',
        metadata: { ipAddress: consumedIp },
      });
      throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);
    }

    const [userRows] = await connection.query(
      `SELECT id, role, status, password_hash
       FROM users
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenRow.user_id]
    );
    const user = userRows[0];
    if (!user || user.role !== 'student' || user.status !== 'active') {
      await connection.rollback();
      await logActivity({
        role: 'student',
        action: 'password_reset.failed_invalid',
        entityType: 'auth',
        metadata: { ipAddress: consumedIp },
      });
      throw new ApiError(400, INVALID_RESET_TOKEN_MESSAGE);
    }

    const samePassword = await bcrypt.compare(String(newPassword || ''), user.password_hash);
    if (samePassword) {
      await connection.rollback();
      await logActivity({
        userId: user.id,
        role: 'student',
        action: 'password_reset.failed_same_password',
        entityType: 'auth',
        metadata: { ipAddress: consumedIp },
      });
      throw new ApiError(422, 'New password must differ from your current password');
    }

    await connection.query(
      `UPDATE users
       SET password_hash = ?,
           token_version = token_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [passwordHash, user.id]
    );
    await connection.query(
      `UPDATE auth_sessions
       SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
       WHERE user_id = ?`,
      [user.id]
    );
    await consumePasswordResetToken({
      tokenId: tokenRow.id,
      userId: user.id,
      consumedIp,
      consumedUserAgent,
      connection,
    });

    await connection.commit();

    const mismatch = hasContextMismatch(
      tokenRow.issued_ip,
      tokenRow.issued_user_agent,
      consumedIp,
      consumedUserAgent
    );
    if (mismatch.mismatch) {
      await logActivity({
        userId: user.id,
        role: 'student',
        action: 'password_reset.anomaly_ip_ua_mismatch',
        entityType: 'auth',
        metadata: { ...mismatch, issuedIp: tokenRow.issued_ip, consumedIp },
      });
    }
    await logActivity({
      userId: user.id,
      role: 'student',
      action: 'password_reset.success',
      entityType: 'auth',
      metadata: { ipAddress: consumedIp },
    });
    await logActivity({
      userId: user.id,
      role: 'student',
      action: 'password_reset.success.session_revoke_all',
      entityType: 'auth',
      metadata: { ipAddress: consumedIp },
    });

    return { success: true, userId: user.id };
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
