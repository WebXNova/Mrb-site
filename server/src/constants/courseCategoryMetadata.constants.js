/** @typedef {'9th'|'10th'|'11th'|'12th'|'bachelor'|'o_level'|'a_level'|'entry_test'|'not_applicable'} CourseCategoryClassLevel */
/** @typedef {'pre_medical'|'pre_engineering'|'commerce'|'computer_science'|'arts_humanities'|'general'|'entry_test_prep'|'ics'|'not_applicable'} CourseCategoryDepartment */
/** @typedef {'sindh_board'|'federal_board'|'punjab_board'|'kpk_board'|'balochistan_board'|'ajk_board'|'cambridge_o_level'|'cambridge_a_level'|'not_applicable'} CourseCategoryBoard */

export const COURSE_CATEGORY_CLASS_LEVELS = Object.freeze([
  '9th',
  '10th',
  '11th',
  '12th',
  'bachelor',
  'o_level',
  'a_level',
  'entry_test',
  'not_applicable',
]);

export const COURSE_CATEGORY_DEPARTMENTS = Object.freeze([
  'pre_medical',
  'pre_engineering',
  'commerce',
  'computer_science',
  'arts_humanities',
  'general',
  'entry_test_prep',
  'ics',
  'not_applicable',
]);

export const COURSE_CATEGORY_BOARDS = Object.freeze([
  'sindh_board',
  'federal_board',
  'punjab_board',
  'kpk_board',
  'balochistan_board',
  'ajk_board',
  'cambridge_o_level',
  'cambridge_a_level',
  'not_applicable',
]);

export const COURSE_CATEGORY_CLASS_LEVEL_DEFAULT = 'not_applicable';
export const COURSE_CATEGORY_DEPARTMENT_DEFAULT = 'not_applicable';
export const COURSE_CATEGORY_BOARD_DEFAULT = 'not_applicable';

export const COURSE_CATEGORY_CLASS_LEVEL_LABELS = Object.freeze({
  '9th': '9th Class',
  '10th': '10th Class',
  '11th': '11th Class',
  '12th': '12th Class',
  bachelor: 'Bachelor',
  o_level: 'O-Level',
  a_level: 'A-Level',
  entry_test: 'Entry Test',
  not_applicable: 'Not applicable',
});

export const COURSE_CATEGORY_DEPARTMENT_LABELS = Object.freeze({
  pre_medical: 'Pre-Medical',
  pre_engineering: 'Pre-Engineering',
  commerce: 'Commerce',
  computer_science: 'Computer Science',
  arts_humanities: 'Arts / Humanities',
  general: 'General',
  entry_test_prep: 'Entry Test Prep',
  ics: 'ICS (Computer Science)',
  not_applicable: 'Not applicable',
});

export const COURSE_CATEGORY_BOARD_LABELS = Object.freeze({
  sindh_board: 'Sindh Board',
  federal_board: 'Federal Board',
  punjab_board: 'Punjab Board',
  kpk_board: 'KPK Board',
  balochistan_board: 'Balochistan Board',
  ajk_board: 'AJK Board',
  cambridge_o_level: 'Cambridge O-Level',
  cambridge_a_level: 'Cambridge A-Level',
  not_applicable: 'Not applicable',
});
