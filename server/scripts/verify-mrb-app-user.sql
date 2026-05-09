-- Run as root to confirm Option A applied (phpMyAdmin or mysql.exe):
--   SELECT User, Host FROM mysql.user WHERE User = 'mrb_app';
--   SHOW DATABASES LIKE 'mrb_learning';

SELECT User AS user_name, Host AS host FROM mysql.user WHERE User = 'mrb_app';
