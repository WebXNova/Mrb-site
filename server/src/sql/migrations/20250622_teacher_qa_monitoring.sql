-- Teacher Q&A monitoring: normalized answers + teacher activity logs.
-- Rollback: 20250622_teacher_qa_monitoring_rollback.sql

CREATE TABLE IF NOT EXISTS teacher_answers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  answer TEXT NOT NULL,
  answer_attachment_url VARCHAR(1000) NULL,
  answer_audio_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ta_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ta_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE KEY uq_ta_question_id (question_id),
  KEY idx_ta_teacher_id (teacher_id),
  KEY idx_ta_teacher_created (teacher_id, created_at DESC),
  KEY idx_ta_question_created (question_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teacher_activity_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  teacher_id BIGINT NOT NULL,
  question_id BIGINT NULL,
  action_type ENUM('QUESTION_VIEWED', 'QUESTION_ANSWERED', 'ANSWER_UPDATED', 'LOGIN', 'LOGOUT') NOT NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tal_teacher_id FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tal_question_id FOREIGN KEY (question_id) REFERENCES student_questions(id) ON DELETE SET NULL ON UPDATE CASCADE,
  KEY idx_tal_teacher_id (teacher_id),
  KEY idx_tal_action_type (action_type),
  KEY idx_tal_created_at (created_at),
  KEY idx_tal_teacher_action_created (teacher_id, action_type, created_at DESC),
  KEY idx_tal_question_id (question_id),
  KEY idx_tal_teacher_created (teacher_id, created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
