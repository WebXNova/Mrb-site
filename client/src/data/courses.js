export const subjects = [
  { id: 'all', name: 'All Subjects', accent: '#4f46e5' },
  { id: 'mdcat', name: 'MDCAT', accent: '#d90915' },
];

export const courses = [
  {
    id: 'mdcat-preparation',
    title: 'MDCAT PREPARATION',
    subject: 'MDCAT',
    subjectId: 'mdcat',
    accentColor: '#d90915',
    coverImage:
      'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&fit=crop&w=1920&q=90',
    summary:
      'Master MDCAT with focused practice, smart revision, and high-yield concepts.',
    summaryBullets: [
      'Master MDCAT with focused practice, smart revision, and high-yield concepts.',
      'Designed for serious students aiming for top medical colleges.',
      'Includes tests, lectures, and structured preparation flow.',
    ],
    instructor: 'MRB Faculty Team',
    lecturesCount: '100+',
    testsCount: '400+',
    durationWeeks: 16,
    rating: 4.9,
    studentsEnrolled: 2400,
    price: 1999,
    originalPrice: null,
    level: 'Comprehensive',
    highlights: [
      'Complete MDCAT preparation roadmap',
      'High-yield concepts and smart revision strategy',
      'Structured lectures and test practice flow',
      'Focused preparation for top medical colleges',
    ],
  },
];

export function getCourseById(id) {
  return courses.find((c) => c.id === id);
}

export function getCoursesBySubject(subjectId) {
  if (!subjectId || subjectId === 'all') return courses;
  return courses.filter((c) => c.subjectId === subjectId);
}
