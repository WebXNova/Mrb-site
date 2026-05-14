-- Course operational delivery: cohorts / batches (no curriculum columns on this table).
-- See server/docs/migrations.md

CREATE TABLE IF NOT EXISTS course_batches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  code VARCHAR(120) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  enrollment_open_at DATETIME NOT NULL,
  enrollment_close_at DATETIME NOT NULL,
  total_seats INT NOT NULL,
  seats_filled INT NOT NULL DEFAULT 0,
  instructor_name VARCHAR(160) NULL,
  schedule_label VARCHAR(180) NULL,
  timezone VARCHAR(80) NOT NULL DEFAULT 'UTC',
  status VARCHAR(40) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by BIGINT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_course_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT fk_course_batches_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_course_batches_code (code),
  KEY idx_course_batches_course (course_id),
  KEY idx_course_batches_status (status),
  KEY idx_course_batches_active (course_id, is_active),
  KEY idx_course_batches_enrollment_window (enrollment_open_at, enrollment_close_at),
  KEY idx_course_batches_course_status (course_id, status)
) ENGINE=InnoDB;
