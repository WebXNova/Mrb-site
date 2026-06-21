/**
 * Atomic batch seat reservation — prevents course overbooking.
 */

import { mysqlPool } from '../config/mysql.js';
import { CourseFullError } from '../errors/enrollment/EnrollmentStateErrors.js';

/**
 * @param {number} courseId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 * @returns {Promise<{ batchId: number, totalSeats: number, seatsFilled: number, seatsRemaining: number } | null>}
 */
export async function loadBatchSeatSnapshot(courseId, executor = mysqlPool) {
  const cid = Number(courseId);
  if (!Number.isInteger(cid) || cid <= 0) return null;

  const [rows] = await executor.query(
    `SELECT id, total_seats, seats_filled
     FROM course_batches
     WHERE course_id = ?
     LIMIT 1`,
    [cid]
  );
  const row = rows[0];
  if (!row) return null;

  const totalSeats = Number(row.total_seats ?? 0);
  const seatsFilled = Number(row.seats_filled ?? 0);
  const seatsRemaining = totalSeats > 0 ? Math.max(0, totalSeats - seatsFilled) : Number.POSITIVE_INFINITY;

  return {
    batchId: Number(row.id),
    totalSeats,
    seatsFilled,
    seatsRemaining: Number.isFinite(seatsRemaining) ? seatsRemaining : null,
  };
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} courseId
 */
export async function assertAndReserveBatchSeat(connection, courseId) {
  const cid = Number(courseId);
  const [rows] = await connection.query(
    `SELECT id, total_seats, seats_filled
     FROM course_batches
     WHERE course_id = ?
     LIMIT 1
     FOR UPDATE`,
    [cid]
  );
  const row = rows[0];
  if (!row) return;

  const totalSeats = Number(row.total_seats ?? 0);
  if (totalSeats <= 0) return;

  const filled = Number(row.seats_filled ?? 0);
  if (filled >= totalSeats) {
    throw new CourseFullError({ courseId: cid, batchId: Number(row.id) });
  }

  const [upd] = await connection.query(
    `UPDATE course_batches
     SET seats_filled = seats_filled + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
       AND seats_filled < total_seats`,
    [row.id]
  );

  if (Number(upd?.affectedRows ?? 0) === 0) {
    throw new CourseFullError({ courseId: cid, batchId: Number(row.id) });
  }
}
