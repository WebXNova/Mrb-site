-- Payment receiving accounts (JazzCash / EasyPaisa) — admin-managed manual payment routing.

CREATE TABLE IF NOT EXISTS payment_accounts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  method ENUM('jazzcash', 'easypaisa') NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  account_title VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT NOT NULL,
  updated_by BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_accounts_created_by FOREIGN KEY (created_by) REFERENCES users(id),
  CONSTRAINT fk_payment_accounts_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  KEY idx_payment_accounts_method (method),
  KEY idx_payment_accounts_is_active (is_active),
  KEY idx_payment_accounts_method_active (method, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_account_audit_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  payment_account_id BIGINT UNSIGNED NOT NULL,
  action ENUM('created', 'updated', 'activated', 'deactivated') NOT NULL,
  changed_by BIGINT NOT NULL,
  old_value JSON NULL,
  new_value JSON NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_account_audit_account FOREIGN KEY (payment_account_id) REFERENCES payment_accounts(id),
  CONSTRAINT fk_payment_account_audit_changed_by FOREIGN KEY (changed_by) REFERENCES users(id),
  KEY idx_payment_account_audit_account (payment_account_id),
  KEY idx_payment_account_audit_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
