export const TEACHER_STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

function normalizeTeacherStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'inactive') return 'inactive';
  if (value === 'active') return 'active';
  return value;
}

function teacherMatchesSearch(teacher, search) {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return true;
  const haystack = [teacher.fullName, teacher.email, teacher.username]
    .map((part) => String(part || '').toLowerCase())
    .join(' ');
  return haystack.includes(query);
}

function teacherMatchesStatus(teacher, statusFilter) {
  if (statusFilter === 'all') return true;
  return normalizeTeacherStatus(teacher.status) === statusFilter;
}

function teacherMatchesSubject(teacher, subjectFilter) {
  if (subjectFilter === 'all') return true;
  const query = String(subjectFilter || '').trim().toLowerCase();
  const titles = Array.isArray(teacher.assignedSubjectTitles) ? teacher.assignedSubjectTitles : [];
  return titles.some((title) => String(title || '').trim().toLowerCase() === query);
}

export function buildTeacherSubjectFilterOptions(teachers) {
  const titles = new Set();
  teachers.forEach((teacher) => {
    (teacher.assignedSubjectTitles || []).forEach((title) => {
      const normalized = String(title || '').trim();
      if (normalized) titles.add(normalized);
    });
  });
  return [
    { key: 'all', label: 'All Subjects' },
    ...[...titles].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).map((title) => ({
      key: title.toLowerCase(),
      label: title,
    })),
  ];
}

export function filterTeachersList(teachers, { search = '', statusFilter = 'all', subjectFilter = 'all' } = {}) {
  return teachers.filter(
    (teacher) =>
      teacherMatchesSearch(teacher, search) &&
      teacherMatchesStatus(teacher, statusFilter) &&
      teacherMatchesSubject(teacher, subjectFilter)
  );
}

export function countTeachersByStatus(teachers) {
  let active = 0;
  let inactive = 0;
  teachers.forEach((teacher) => {
    if (normalizeTeacherStatus(teacher.status) === 'active') active += 1;
    else if (normalizeTeacherStatus(teacher.status) === 'inactive') inactive += 1;
  });
  return { active, inactive };
}
