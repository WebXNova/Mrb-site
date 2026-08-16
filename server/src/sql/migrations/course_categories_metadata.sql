-- Additive metadata columns on course_categories (class / department / board).

ALTER TABLE course_categories
  ADD COLUMN class_level ENUM(
    '9th','10th','11th','12th','o_level','a_level','entry_test','not_applicable'
  ) NOT NULL DEFAULT 'not_applicable' AFTER description,
  ADD COLUMN department ENUM(
    'pre_medical','pre_engineering','commerce','computer_science','arts_humanities','general','entry_test_prep','ics','not_applicable'
  ) NOT NULL DEFAULT 'not_applicable' AFTER class_level,
  ADD COLUMN board ENUM(
    'sindh_board','federal_board','punjab_board','kpk_board','balochistan_board','ajk_board','cambridge_o_level','cambridge_a_level','not_applicable'
  ) NOT NULL DEFAULT 'not_applicable' AFTER department;
