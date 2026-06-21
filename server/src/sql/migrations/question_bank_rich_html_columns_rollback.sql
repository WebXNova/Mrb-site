-- Rollback rich HTML columns (data in html columns will be lost).

ALTER TABLE question_options DROP COLUMN IF EXISTS option_html;
ALTER TABLE question_bank DROP COLUMN IF EXISTS explanation_html;
ALTER TABLE question_bank DROP COLUMN IF EXISTS question_html;
