/**
 * Daily learning streak — updated on dashboard visits / login activity.
 */

import { mysqlPool } from '../config/mysql.js';

function toUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return toUtcDateString(value);
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function daysBetween(fromStr, toStr) {
  const from = Date.parse(`${fromStr}T00:00:00Z`);
  const to = Date.parse(`${toStr}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.round((to - from) / 86400000);
}

/**
 * Record today's visit and return streak payload for dashboard UI.
 *
 * @param {number} userId
 */
export async function recordAndGetLearningStreak(userId) {
  const uid = Number(userId);
  if (!Number.isInteger(uid) || uid <= 0) {
    return { count: 0, status: 'inactive', message: null, missedDays: 0 };
  }

  const today = toUtcDateString();

  const [rows] = await mysqlPool.query(
    `SELECT learning_streak_count, learning_streak_last_date
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [uid]
  );
  const row = rows[0];
  if (!row) {
    return { count: 0, status: 'inactive', message: null, missedDays: 0 };
  }

  const lastDate = parseDateOnly(row.learning_streak_last_date);
  let count = Number(row.learning_streak_count ?? 0);
  let status = 'active';
  let message = null;
  let missedDays = 0;

  if (!lastDate) {
    count = 1;
  } else if (lastDate === today) {
    missedDays = 0;
  } else {
    const gap = daysBetween(lastDate, today);
    missedDays = Math.max(gap - 1, 0);

    if (gap <= 0) {
      missedDays = 0;
    } else if (missedDays >= 3) {
      count = 0;
      status = 'broken';
      message = 'Streak broken. Start a new streak today!';
    } else if (missedDays === 2) {
      count = Math.max(count, 0) + 1;
      status = 'critical';
      message = 'Streak will break tomorrow! Log in today to keep it alive.';
    } else if (missedDays === 1) {
      count = Math.max(count, 0) + 1;
      status = 'at_risk';
      message = 'Streak at risk! Log in today to keep it alive.';
    } else {
      count = Math.max(count, 0) + 1;
      status = 'active';
    }
  }

  if (lastDate !== today) {
    await mysqlPool.query(
      `UPDATE users
       SET learning_streak_count = ?, learning_streak_last_date = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [count, today, uid]
    );
  }

  return { count, status, message, missedDays };
}
