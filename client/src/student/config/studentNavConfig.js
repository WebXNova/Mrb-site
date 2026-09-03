export const studentNavItems = [
  { to: '/dashboard', label: 'Dashboard', end: true, icon: 'dashboard' },
  { to: '/dashboard/lectures', label: 'Lectures', icon: 'video' },
  { to: '/dashboard/tests', label: 'Tests', icon: 'clipboard-check' },
  { to: '/tests/my-results', label: 'My Results', icon: 'clipboard-check' },
  { to: '/dashboard/notes', label: 'Notes', icon: 'file-text' },
  { to: '/dashboard/leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { to: '/student/questions', label: 'Doubts', icon: 'help-circle' },
];

export const studentBottomNavItems = [
  { to: '/dashboard', label: 'Home', end: true, icon: 'dashboard' },
  { to: '/dashboard/lectures', label: 'Learn', icon: 'video' },
  { to: '/dashboard/tests', label: 'Tests', icon: 'clipboard-check' },
];

export function getStudentPageTitle(pathname) {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname.startsWith('/dashboard/settings/profile')) return 'Profile';
  if (pathname.startsWith('/dashboard/settings')) return 'Settings';
  if (pathname.startsWith('/dashboard/my-courses')) return 'My Courses';
  if (pathname.startsWith('/dashboard/my-course')) return 'Course Details';
  if (pathname.startsWith('/dashboard/lectures/')) return 'Lecture';
  if (pathname.startsWith('/dashboard/lectures')) return 'Lectures';
  if (pathname.startsWith('/dashboard/leaderboard')) return 'Leaderboard';
  if (pathname.startsWith('/tests/my-results') || pathname.startsWith('/tests/my-tests')) return 'My Results';
  if (pathname.startsWith('/dashboard/tests/history')) return 'Results';
  if (pathname.match(/\/dashboard\/tests\/[^/]+\/results\//)) return 'Result detail';
  if (pathname.startsWith('/dashboard/tests')) return 'Tests';
  if (pathname.startsWith('/dashboard/notes')) return 'Notes';
  if (pathname.startsWith('/student/questions/') && pathname !== '/student/questions') return 'Question';
  if (pathname.startsWith('/student/questions')) return 'Doubts';
  if (pathname.startsWith('/dashboard/questions/')) return 'Question';
  if (pathname.startsWith('/dashboard/questions')) return 'Questions';
  if (pathname.startsWith('/dashboard/profile')) return 'Profile';
  if (pathname.startsWith('/dashboard/notifications')) return 'Notifications';
  return 'Student Portal';
}
