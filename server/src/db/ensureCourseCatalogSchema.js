/**
 * Ensures public catalog reads (`courseCatalogQueries`) work on databases that existed
 * before `course_pricing` / `short_description` were added. Full `schema.sql` only
 * runs when the geo base schema is absent (`provinces` missing).
 */

export async function ensureCourseCatalogSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  const [coursesTbl] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses'`,
    [db]
  );
  if (Number(coursesTbl[0]?.n ?? 0) === 0) return;

  const [sdCol] = await mysqlPool.query(
    `SELECT COUNT(*) AS n
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'courses' AND COLUMN_NAME = 'short_description'`,
    [db]
  );
  if (Number(sdCol[0]?.n ?? 0) === 0) {
    await mysqlPool.query(
      `ALTER TABLE courses ADD COLUMN short_description VARCHAR(512) NULL AFTER description`
    );
    console.log('[schema] Added courses.short_description');
  }

  await mysqlPool.query(`
    CREATE TABLE IF NOT EXISTS course_pricing (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      course_id BIGINT NOT NULL,
      price_amount INT NOT NULL,
      original_price_amount INT NULL,
      currency_code VARCHAR(10) NOT NULL DEFAULT 'PKR',
      pricing_type ENUM('free', 'one_time', 'subscription') NOT NULL DEFAULT 'one_time',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      enrollment_visible TINYINT(1) NOT NULL DEFAULT 1,
      public_purchase_visible TINYINT(1) NOT NULL DEFAULT 1,
      starts_at TIMESTAMP NULL DEFAULT NULL,
      ends_at TIMESTAMP NULL DEFAULT NULL,
      created_by BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_course_pricing_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      CONSTRAINT fk_course_pricing_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      KEY idx_course_pricing_course_active (course_id, is_active),
      KEY idx_course_pricing_course_window (course_id, starts_at, ends_at)
    )
  `);
}
