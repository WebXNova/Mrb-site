-- Attempt-level immutable exam snapshot (P0 test integrity).
-- Captured once at attempt start; load/save/grade must use this, not live test_questions.

ALTER TABLE test_attempts
  ADD COLUMN exam_snapshot_json JSON NULL AFTER delivery_layout_json;
