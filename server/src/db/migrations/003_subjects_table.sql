-- Course-scoped relational subjects (curriculum containers). Lectures/tests are NOT FK-linked yet.
CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  course_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  order_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_subjects_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  KEY idx_subjects_course (course_id),
  KEY idx_subjects_course_order (course_id, order_index),
  KEY idx_subjects_course_active (course_id, is_active)
) ENGINE=InnoDB;
