-- Google OAuth fields for student sign-in (run once against existing databases).

ALTER TABLE users
  MODIFY COLUMN password_hash VARCHAR(255) NULL,
  ADD COLUMN google_sub VARCHAR(255) NULL AFTER password_hash,
  ADD COLUMN avatar_url VARCHAR(512) NULL AFTER full_name,
  ADD UNIQUE KEY uq_users_google_sub (google_sub);
