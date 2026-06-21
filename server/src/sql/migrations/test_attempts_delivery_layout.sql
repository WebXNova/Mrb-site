-- G-RT-05: Persist per-attempt question/option delivery order for shuffle settings.
-- Up:       sql/migrations/test_attempts_delivery_layout.sql
-- Rollback: sql/migrations/test_attempts_delivery_layout_rollback.sql

ALTER TABLE test_attempts
  ADD COLUMN delivery_layout_json JSON NULL AFTER attempt_nonce;
