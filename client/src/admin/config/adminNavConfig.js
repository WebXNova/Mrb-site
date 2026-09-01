import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PlayCircleOutlineOutlinedIcon from '@mui/icons-material/PlayCircleOutlineOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import { adminRoute } from '../../config/adminPaths';

export function getAdminNavItems() {
  return [
    { to: adminRoute(), label: 'Dashboard', end: true, Icon: DashboardOutlinedIcon },
    { to: adminRoute('manual-payments'), label: 'New Admissions', Icon: PaymentsOutlinedIcon },
    { to: adminRoute('standalone-test-payments'), label: 'Paid Test Payments', Icon: AssignmentOutlinedIcon },
    { to: adminRoute('registrations'), label: 'Registrations', Icon: HowToRegOutlinedIcon },
    { to: adminRoute('tests'), label: 'Tests', Icon: AssignmentOutlinedIcon },
    { to: adminRoute('leaderboard'), label: 'Leaderboard', Icon: EmojiEventsOutlinedIcon },
    { to: adminRoute('lectures'), label: 'Lectures', Icon: PlayCircleOutlineOutlinedIcon },
    { to: adminRoute('courses'), label: 'Courses', Icon: SchoolOutlinedIcon },
    { to: adminRoute('chapters'), label: 'Chapters', Icon: MenuBookOutlinedIcon },
    { to: adminRoute('notes'), label: 'Notes', Icon: DescriptionOutlinedIcon },
    {
      to: adminRoute('settings/course-categories'),
      label: 'Course Categories',
      Icon: CategoryOutlinedIcon,
    },
    {
      to: adminRoute('settings/coupons'),
      label: 'Coupons',
      Icon: LocalOfferOutlinedIcon,
    },
    { to: adminRoute('qa-monitoring'), label: 'Q&A Monitoring', Icon: QuestionAnswerOutlinedIcon },
    { to: adminRoute('users'), label: 'Users', Icon: PeopleOutlinedIcon },
    { to: adminRoute('teachers'), label: 'Teachers', Icon: BadgeOutlinedIcon },
    { to: adminRoute('teacher-insights'), label: 'Teacher Insights', Icon: InsightsOutlinedIcon },
    { to: adminRoute('remarks'), label: 'Remarks', Icon: RateReviewOutlinedIcon },
    {
      to: adminRoute('settings/payment-accounts'),
      label: 'Payment Accounts',
      Icon: AccountBalanceWalletOutlinedIcon,
    },
    { to: adminRoute('logs'), label: 'Logs', Icon: HistoryOutlinedIcon },
    { to: adminRoute('settings'), label: 'Settings', Icon: SettingsOutlinedIcon, end: true },
  ];
}

/** @deprecated Use getAdminNavItems() */
export const adminNavItems = getAdminNavItems();

/** @param {string} pathname */
export function buildAdminBreadcrumbs(pathname) {
  const base = adminRoute();
  const crumbs = [{ label: 'Admin', to: base }];
  const prefix = `${base}/`;
  const segments = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length).split('/').filter(Boolean)
    : [];

  if (!segments.length) {
    crumbs.push({ label: 'Dashboard' });
    return crumbs;
  }

  const labels = {
    courses: 'Courses',
    chapters: 'Chapters',
    lectures: 'Lectures',
    tests: 'Tests',
    leaderboard: 'Leaderboard',
    users: 'Users',
    teachers: 'Teachers',
    'qa-monitoring': 'Q&A Monitoring',
    'teacher-insights': 'Teacher Insights',
    remarks: 'Remarks',
    registrations: 'Registrations',
    'manual-payments': 'New Admissions',
    'standalone-test-payments': 'Paid Test Payments',
    logs: 'Logs',
    notes: 'Notes',
    settings: 'Settings',
    'payment-accounts': 'Payment Accounts',
    'course-categories': 'Course Categories',
    coupons: 'Coupons',
    questions: 'Questions',
    edit: 'Edit',
    subjects: 'Subjects',
    batches: 'Batches',
  };

  let path = base;
  segments.forEach((seg, i) => {
    path += `/${seg}`;
    const isId = /^\d+$/.test(seg);
    const label = isId ? `#${seg}` : labels[seg] || seg.replace(/-/g, ' ');
    const isLast = i === segments.length - 1;
    crumbs.push(isLast ? { label } : { label, to: path });
  });
  return crumbs;
}
