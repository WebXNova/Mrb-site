import { NavLink, Outlet } from 'react-router-dom';
import { teacherApi } from '../../api/teacherApi';
import { clearTeacherAuth, broadcastRoleLogout } from '../../auth/session';
import { teacherBottomNavItems, teacherNavItems } from '../config/teacherNavConfig';
import { useIsStudentMobileNav } from '../../student/hooks/useMediaQuery';
import '../../styles/global.css';
import '../../admin/styles/admin.css';
import '../../student/styles/student.css';
import '../../student/styles/student-responsive.css';
import '../styles/teacherLayout.css';

function TeacherNavLinks() {
  return teacherNavItems.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `student-nav__item ${isActive ? 'student-nav__item--active' : ''}`}
    >
      {item.label}
    </NavLink>
  ));
}

export default function TeacherLayout() {
  const isMobileNav = useIsStudentMobileNav();

  return (
    <div className="student-shell student-shell--teacher">
      {!isMobileNav ? (
        <aside id="teacher-sidebar-nav" className="student-sidebar" aria-label="Teacher navigation">
          <div className="student-brand">
            <img src="/brand/mrb-logo-icon.png" alt="MRB" className="student-brand__icon" />
            <div>
              <p className="student-brand__title">MRB Teacher</p>
              <p className="student-brand__subtitle">Teaching Portal</p>
            </div>
          </div>
          <nav className="student-nav" aria-label="Main">
            <TeacherNavLinks />
          </nav>
        </aside>
      ) : null}

      <section className="student-content student-content--teacher">
        <Outlet />
      </section>

      {isMobileNav ? (
        <nav className="student-bottom-nav student-bottom-nav--teacher" aria-label="Teacher mobile navigation">
          {teacherBottomNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `student-bottom-nav__item ${isActive ? 'student-bottom-nav__item--active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

export async function teacherLogout(navigate) {
  try {
    await teacherApi.logout();
  } catch {
    // Ignore logout API failures and still clear local auth state.
  }
  clearTeacherAuth();
  broadcastRoleLogout('teacher');
  navigate('/teacher/login', { replace: true });
}
