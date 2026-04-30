import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import '../../styles/global.css';
import '../../admin/styles/admin.css';
import '../styles/student.css';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/dashboard/tests', label: 'Tests' },
  { to: '/dashboard/lectures', label: 'Lectures' },
  { to: '/dashboard/questions', label: 'Questions' },
  { to: '/dashboard/results', label: 'Results' },
  { to: '/dashboard/notifications', label: 'Notifications' },
  { to: '/dashboard/profile', label: 'Profile' },
];

export default function StudentLayout() {
  const navigate = useNavigate();
  const student = JSON.parse(localStorage.getItem('student_user') || 'null');

  function handleLogout() {
    localStorage.removeItem('student_access_token');
    localStorage.removeItem('student_user');
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
            <p className="student-topbar__title">Student Portal</p>
            <p className="student-topbar__subtitle">Access lectures, tests, questions, and your results.</p>
            {student?.fullName ? (
              <p className="student-topbar__subtitle">Signed in as {student.fullName}</p>
            ) : null}
          </div>
          <button className="btn btn--secondary btn--sm" type="button" onClick={handleLogout}>
            Logout
          </button>
        </header>
        <Outlet />
      </section>
    </div>
  );
}
