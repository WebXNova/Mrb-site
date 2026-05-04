/** Manual Q&A subject values (must match server `studentQuestions.service.js`). */
export const QA_SUBJECT_OPTIONS = [
  { value: 'physics', label: 'Physics', emoji: '⚛' },
  { value: 'chemistry', label: 'Chemistry', emoji: '🧪' },
  { value: 'biology', label: 'Biology', emoji: '🧬' },
  { value: 'english', label: 'English', emoji: '📘' },
  { value: 'logical_reasoning', label: 'Logical reasoning', emoji: '🧩' },
];

const OPTION_BY_VALUE = Object.fromEntries(QA_SUBJECT_OPTIONS.map((o) => [o.value, o]));

export function qaSubjectLabel(value) {
  const key = String(value || '').toLowerCase();
  return OPTION_BY_VALUE[key]?.label || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function qaSubjectEmoji(value) {
  const key = String(value || '').toLowerCase();
  return OPTION_BY_VALUE[key]?.emoji || '💬';
}

/** CSS modifier for `sqachat-list__icon--{modifier}` */
export function qaSubjectIconModifier(value) {
  const key = String(value || '').toLowerCase();
  return OPTION_BY_VALUE[key] ? key : null;
}

/** Short initials for chat header avatar */
export function qaSubjectAvatarLetters(value) {
  const key = String(value || '').toLowerCase();
  const map = {
    physics: 'PH',
    chemistry: 'CH',
    biology: 'BI',
    english: 'EN',
    logical_reasoning: 'LR',
  };
  return map[key] || 'QA';
}
