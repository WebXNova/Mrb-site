/** Values must match server `studentQuestions.service` SUBJECTS. */
export const QA_SUBJECT_ORDER = [
  'physics',
  'chemistry',
  'biology',
  'english',
  'logical_reasoning',
];

export const QA_SUBJECT_META = {
  physics: { label: 'Physics', emoji: '⚛', short: 'PH', iconClass: 'sqachat-list__icon--physics' },
  chemistry: { label: 'Chemistry', emoji: '🧪', short: 'CH', iconClass: 'sqachat-list__icon--chemistry' },
  biology: { label: 'Biology', emoji: '🧬', short: 'BI', iconClass: 'sqachat-list__icon--biology' },
  english: { label: 'English', emoji: '📖', short: 'EN', iconClass: 'sqachat-list__icon--english' },
  logical_reasoning: {
    label: 'Logical reasoning',
    emoji: '🔀',
    short: 'LR',
    iconClass: 'sqachat-list__icon--logical',
  },
};

export function normalizeQaSubject(value) {
  return String(value || '').toLowerCase().trim();
}

export function getQaSubjectMeta(value) {
  const key = normalizeQaSubject(value);
  const row = QA_SUBJECT_META[key];
  if (row) return { key, ...row };
  return {
    key,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    emoji: '💬',
    short: (key.slice(0, 2) || '??').toUpperCase(),
    iconClass: '',
  };
}
