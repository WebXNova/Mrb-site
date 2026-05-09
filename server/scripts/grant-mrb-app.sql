-- XAMPP / local MySQL — run as root (adjust path to your install).
-- CMD (from project folder):
--   "C:\xampp\mysql\bin\mysql.exe" -u root -p < server\scripts\grant-mrb-app.sql
--
-- Must match server/.env: MYSQL_USER mrb_app + MYSQL_PASSWORD mrb_app_local_only + MYSQL_DATABASE mrb_learning

CREATE DATABASE IF NOT EXISTS mrb_learning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

DROP USER IF EXISTS 'mrb_app'@'localhost';
DROP USER IF EXISTS 'mrb_app'@'127.0.0.1';
DROP USER IF EXISTS 'mrb_app'@'%';

CREATE USER 'mrb_app'@'localhost' IDENTIFIED BY 'mrb_app_local_only';
CREATE USER 'mrb_app'@'127.0.0.1' IDENTIFIED BY 'mrb_app_local_only';
CREATE USER 'mrb_app'@'%' IDENTIFIED BY 'mrb_app_local_only';

GRANT ALL PRIVILEGES ON mrb_learning.* TO 'mrb_app'@'localhost';
GRANT ALL PRIVILEGES ON mrb_learning.* TO 'mrb_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON mrb_learning.* TO 'mrb_app'@'%';

-- Ensures password matches even if CREATE was partially synced before
ALTER USER 'mrb_app'@'localhost' IDENTIFIED BY 'mrb_app_local_only';
ALTER USER 'mrb_app'@'127.0.0.1' IDENTIFIED BY 'mrb_app_local_only';
ALTER USER 'mrb_app'@'%' IDENTIFIED BY 'mrb_app_local_only';

FLUSH PRIVILEGES;
