/**
 * Shared fraud lookups across course manual_payments and standalone_test_payments.
 * Does not reimplement computeManualPaymentRisk — only data gathering.
 */

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} transactionId
 */
export async function lockAndLoadTransactionIdMatches(connection, transactionId) {
  const [courseRows] = await connection.query(
    `SELECT id, student_id, status, risk_flags, risk_level, 'course' AS product
     FROM manual_payments
     WHERE transaction_id = ?
     FOR UPDATE`,
    [transactionId]
  );
  const [standaloneRows] = await connection.query(
    `SELECT id, student_id, status, risk_flags, risk_level, 'standalone_test' AS product
     FROM standalone_test_payments
     WHERE transaction_id = ?
     FOR UPDATE`,
    [transactionId]
  );
  return [...courseRows, ...standaloneRows];
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {string} sha256
 */
export async function lockAndLoadScreenshotHashMatches(connection, sha256) {
  const [courseRows] = await connection.query(
    `SELECT student_id, status
     FROM manual_payments
     WHERE screenshot_file_hash = ?
       AND status <> 'rejected'
     FOR UPDATE`,
    [sha256]
  );
  const [standaloneRows] = await connection.query(
    `SELECT student_id, status
     FROM standalone_test_payments
     WHERE screenshot_file_hash = ?
       AND status <> 'rejected'
     FOR UPDATE`,
    [sha256]
  );
  return [...courseRows, ...standaloneRows];
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} studentId
 * @param {string} transactionId
 */
export async function countRecentDifferentTransactionIds(connection, studentId, transactionId) {
  const [course] = await connection.query(
    `SELECT COUNT(*) AS n
     FROM manual_payments
     WHERE student_id = ?
       AND transaction_id <> ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    [studentId, transactionId]
  );
  const [standalone] = await connection.query(
    `SELECT COUNT(*) AS n
     FROM standalone_test_payments
     WHERE student_id = ?
       AND transaction_id <> ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    [studentId, transactionId]
  );
  return Number(course[0]?.n ?? 0) + Number(standalone[0]?.n ?? 0);
}

/**
 * @param {import('mysql2/promise').PoolConnection} connection
 * @param {number} studentId
 */
export async function loadPriorSenderNumbers(connection, studentId) {
  const [course] = await connection.query(
    `SELECT DISTINCT sender_phone_number AS phone
     FROM manual_payments
     WHERE student_id = ?
       AND status IN ('pending_review', 'approved')`,
    [studentId]
  );
  const [standalone] = await connection.query(
    `SELECT DISTINCT sender_phone_number AS phone
     FROM standalone_test_payments
     WHERE student_id = ?
       AND status IN ('pending_review', 'approved')`,
    [studentId]
  );
  return [...course, ...standalone].map((row) => String(row.phone));
}
