/**
 * Ensures reviews + review_audit_log tables exist on existing databases.
 */

async function tableExists(pool, db, tableName) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [db, tableName]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

const CREATE_REVIEWS_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NULL,
  course_name VARCHAR(200) NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review_message TEXT NOT NULL,
  status ENUM('PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'PENDING',
  featured TINYINT(1) NOT NULL DEFAULT 0,
  published TINYINT(1) NOT NULL DEFAULT 0,
  published_at TIMESTAMP NULL,
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  approved_by_admin_id BIGINT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(512) NULL,
  CONSTRAINT fk_reviews_approved_by
    FOREIGN KEY (approved_by_admin_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  UNIQUE KEY uq_reviews_uuid (uuid),
  KEY idx_reviews_status (status),
  KEY idx_reviews_featured (featured),
  KEY idx_reviews_published (published),
  KEY idx_reviews_created_at (created_at),
  KEY idx_reviews_published_list (published, status, featured, created_at DESC),
  KEY idx_reviews_phone_created (phone, created_at),
  KEY idx_reviews_ip_created (ip_address, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const CREATE_REVIEW_AUDIT_SQL = `
CREATE TABLE IF NOT EXISTS review_audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  review_id BIGINT NOT NULL,
  admin_id BIGINT NULL,
  admin_name VARCHAR(120) NULL,
  action VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NULL,
  note TEXT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_review_audit_review
    FOREIGN KEY (review_id) REFERENCES reviews(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_review_audit_admin
    FOREIGN KEY (admin_id) REFERENCES users(id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_review_audit_review_created (review_id, created_at DESC),
  KEY idx_review_audit_action_created (action, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export async function ensureReviewsSchema(mysqlPool) {
  const [dbRows] = await mysqlPool.query('SELECT DATABASE() AS db');
  const db = dbRows[0]?.db;
  if (!db) return;

  if (!(await tableExists(mysqlPool, db, 'users'))) {
    console.warn('[schema] reviews skipped — users table missing');
    return;
  }

  if (!(await tableExists(mysqlPool, db, 'reviews'))) {
    await mysqlPool.query(CREATE_REVIEWS_SQL);
    console.log('[schema] Created reviews');
  }

  if (!(await tableExists(mysqlPool, db, 'review_audit_log'))) {
    await mysqlPool.query(CREATE_REVIEW_AUDIT_SQL);
    console.log('[schema] Created review_audit_log');
  }

  if (await tableExists(mysqlPool, db, 'reviews')) {
    console.log('[schema] reviews ready');
  }
}
