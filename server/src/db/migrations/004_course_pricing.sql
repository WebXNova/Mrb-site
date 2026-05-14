-- Course pricing domain: relational catalog pricing isolated from `courses`.
-- Additive only: legacy `courses.price` / `courses.original_price` remain temporarily
-- for migration compatibility. Runtime reads/writes have moved to `course_pricing`.

CREATE TABLE IF NOT EXISTS course_pricing (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  price_amount INT NOT NULL,
  original_price_amount INT NULL,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'PKR',
  pricing_type ENUM('free', 'one_time') NOT NULL DEFAULT 'one_time',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at TIMESTAMP NULL DEFAULT NULL,
  ends_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_pricing_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_pricing_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_course_pricing_course_active (course_id, is_active),
  KEY idx_course_pricing_course_window (course_id, starts_at, ends_at)
) ENGINE=InnoDB;

-- Backfill: one active row per existing course, currency PKR. Skip courses that
-- already have any pricing row so re-running the migration is a no-op.
INSERT INTO course_pricing (
  course_id, price_amount, original_price_amount, currency_code, pricing_type,
  is_active, starts_at, ends_at, created_by
)
SELECT
  c.id,
  GREATEST(COALESCE(c.price, 0), 0),
  CASE
    WHEN c.original_price IS NULL THEN NULL
    WHEN c.original_price < COALESCE(c.price, 0) THEN NULL
    ELSE c.original_price
  END,
  'PKR',
  CASE WHEN COALESCE(c.price, 0) = 0 THEN 'one_time' ELSE 'one_time' END,
  1,
  NULL,
  NULL,
  c.created_by
FROM courses c
WHERE NOT EXISTS (SELECT 1 FROM course_pricing p WHERE p.course_id = c.id);

-- Promote zero-amount rows to `free` so the domain rule (free implies amount 0) holds.
UPDATE course_pricing SET pricing_type = 'free' WHERE price_amount = 0 AND pricing_type <> 'free';
