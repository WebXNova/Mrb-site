-- H-04/H-05: durable Safepay webhook replay ledger
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  webhook_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_processed_webhooks_hash (webhook_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
