export const COURSE_CATEGORY_CLASS_LEVEL_OPTIONS = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: '9th', label: '9th Class' },
  { value: '10th', label: '10th Class' },
  { value: '11th', label: '11th Class' },
  { value: '12th', label: '12th Class' },
  { value: 'bachelor', label: 'Bachelor' },
  { value: 'o_level', label: 'O-Level' },
  { value: 'a_level', label: 'A-Level' },
  { value: 'entry_test', label: 'Entry Test' },
];

export const COURSE_CATEGORY_DEPARTMENT_OPTIONS = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'pre_medical', label: 'Pre-Medical' },
  { value: 'pre_engineering', label: 'Pre-Engineering' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'computer_science', label: 'Computer Science' },
  { value: 'ics', label: 'ICS (Computer Science)' },
  { value: 'arts_humanities', label: 'Arts / Humanities' },
  { value: 'general', label: 'General' },
  { value: 'entry_test_prep', label: 'Entry Test Prep' },
];

export const COURSE_CATEGORY_BOARD_OPTIONS = [
  { value: 'not_applicable', label: 'Not applicable' },
  { value: 'sindh_board', label: 'Sindh Board' },
  { value: 'federal_board', label: 'Federal Board' },
  { value: 'punjab_board', label: 'Punjab Board' },
  { value: 'kpk_board', label: 'KPK Board' },
  { value: 'balochistan_board', label: 'Balochistan Board' },
  { value: 'ajk_board', label: 'AJK Board' },
  { value: 'cambridge_o_level', label: 'Cambridge O-Level' },
  { value: 'cambridge_a_level', label: 'Cambridge A-Level' },
];

const CLASS_LABELS = Object.fromEntries(COURSE_CATEGORY_CLASS_LEVEL_OPTIONS.map((o) => [o.value, o.label]));
const DEPARTMENT_LABELS = Object.fromEntries(COURSE_CATEGORY_DEPARTMENT_OPTIONS.map((o) => [o.value, o.label]));
const BOARD_LABELS = Object.fromEntries(COURSE_CATEGORY_BOARD_OPTIONS.map((o) => [o.value, o.label]));

function readMetaValue(category, snakeKey, camelKey) {
  return category?.[snakeKey] ?? category?.[camelKey] ?? 'not_applicable';
}

export function formatClassLevelLabel(value) {
  const key = String(value ?? '').trim();
  if (!key || key === 'not_applicable') return '';
  return CLASS_LABELS[key] || key;
}

export function formatDepartmentLabel(value) {
  const key = String(value ?? '').trim();
  if (!key || key === 'not_applicable') return '';
  return DEPARTMENT_LABELS[key] || key;
}

export function formatBoardLabel(value) {
  const key = String(value ?? '').trim();
  if (!key || key === 'not_applicable') return '';
  return BOARD_LABELS[key] || key;
}

/**
 * Structured detail rows for a single category (public course page).
 * @param {Record<string, unknown>} category
 * @returns {Array<{ label: string, value: string }>}
 */
export function buildCategoryDetailRows(category) {
  const name = String(category?.name ?? '').trim();
  const classLevel = formatClassLevelLabel(readMetaValue(category, 'class_level', 'classLevel'));
  const department = formatDepartmentLabel(readMetaValue(category, 'department', 'department'));
  const board = formatBoardLabel(readMetaValue(category, 'board', 'board'));
  const rows = [];
  if (name) rows.push({ label: 'Category', value: name });
  if (classLevel) rows.push({ label: 'Class / Level', value: classLevel });
  if (department) rows.push({ label: 'Department / Stream', value: department });
  if (board) rows.push({ label: 'Board', value: board });
  return rows;
}

/**
 * Human-readable context parts (excludes "Not applicable").
 * @param {Record<string, unknown>} category
 */
export function formatCategoryContextParts(category) {
  const classLevel = readMetaValue(category, 'class_level', 'classLevel');
  const department = readMetaValue(category, 'department', 'department');
  const board = readMetaValue(category, 'board', 'board');
  const parts = [];
  if (classLevel !== 'not_applicable') parts.push(CLASS_LABELS[classLevel] || classLevel);
  if (department !== 'not_applicable') parts.push(DEPARTMENT_LABELS[department] || department);
  if (board !== 'not_applicable') parts.push(BOARD_LABELS[board] || board);
  return parts;
}

/**
 * Subtext for admin list rows.
 */
export function formatCategoryContextSubtext(category) {
  const parts = formatCategoryContextParts(category);
  return parts.length ? parts.join(' · ') : '';
}

/**
 * Compact chip label for public course surfaces — metadata parts when set, else name.
 */
export function formatCategoryChipLabel(category) {
  const name = String(category?.name ?? '').trim();
  const context = formatCategoryContextSubtext(category);
  if (name && context) return `${name} · ${context}`;
  if (context) return context;
  return name || 'Category';
}

/**
 * Enriched public/admin pill label — name remains primary filter dimension.
 */
export function formatCategoryEnrichedLabel(category) {
  const name = String(category?.name ?? '').trim();
  const context = formatCategoryContextSubtext(category);
  if (!name) return context || 'Category';
  if (!context) return name;
  return `${name} · ${context}`;
}

/**
 * Normalize API category to form defaults.
 */
export function categoryToFormMetadata(category) {
  return {
    class_level: readMetaValue(category, 'class_level', 'classLevel'),
    department: readMetaValue(category, 'department', 'department'),
    board: readMetaValue(category, 'board', 'board'),
  };
}
