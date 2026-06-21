export const teacherNavItems = [
  { to: '/teacher/questions', label: 'Questions' },
  { to: '/teacher/profile', label: 'Profile' },
];

export const teacherBottomNavItems = [
  { to: '/teacher/questions', label: 'Questions' },
  { to: '/teacher/profile', label: 'Profile' },
];

export function getTeacherPageTitle(pathname) {
  if (pathname.startsWith('/teacher/questions')) return 'Questions';
  if (pathname.startsWith('/teacher/profile')) return 'Profile';
  return 'Questions';
}
