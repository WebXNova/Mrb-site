import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { clearStudentAuth, getStoredUser } from '../../auth/session';
import '../../styles/global.css';
import '../../admin/styles/admin.css';
import '../styles/student.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/dashboard/lectures', label: 'Lectures' },
  { to: '/dashboard/tests', label: 'Tests' },
  { to: '/dashboard/questions/ask', label: 'Ask Doubt' },
  { to: '/dashboard/questions', label: 'My Questions' },
  { to: '/dashboard/profile', label: 'Profile' },
  { to: '/dashboard/notifications', label: 'Notifications' },
];

export default function StudentLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const student = getStoredUser('student_user');
  const displayName = student?.username || student?.fullName;

  async function handleLogout() {
    try {
      await studentApi.logout();
    } catch {
      // Ignore logout API failures and still clear local auth state.
    }
    clearStudentAuth();
    navigate('/login', { replace: true });
  }

  return (
    <div className="student-shell">
      <aside className="student-sidebar">
        <div className="student-brand">
          <img src="/brand/mrb-logo-icon.png" alt="MRB" className="student-brand__icon" />
          <div>
            <p className="student-brand__title">MRB Student</p>
            <p className="student-brand__subtitle">Learning Portal</p>
          </div>
        </div>
        <nav className="student-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `student-nav__item ${isActive ? 'student-nav__item--active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="student-content">
        <header className="student-topbar">
          <div>
            <p className="student-topbar__title">MRB Learning</p>
            <p className="student-topbar__subtitle">Access lectures, tests, questions, and your progress.</p>
            {displayName ? (
              <p className="student-topbar__subtitle">Signed in as {displayName}</p>
            ) : null}
          </div>
          <button className="btn btn--secondary btn--sm" type="button" onClick={handleLogout}>
            Logout
          </button>
        </header>
        <Outlet />
      </section>

      <nav className="student-bottom-nav" aria-label="Student mobile navigation">
        {[
          { to: '/dashboard', label: 'Home', end: true },
          { to: '/dashboard/lectures', label: 'Learn' },
          { to: '/dashboard/tests', label: 'Tests' },
          { to: '/dashboard/profile', label: 'Me' },
        ].map((item) => {
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={`student-bottom-nav__item ${isActive ? 'student-bottom-nav__item--active' : ''}`}
            >
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
