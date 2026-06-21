import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { studentApi } from '../../api/studentApi';
import { getStoredUser } from '../../auth/session';
import StudentIcon from './icons/StudentIcons';
import '../styles/student-profile-menu.css';

function getStudentInitials(student) {
  const source = student?.fullName || student?.username || student?.email || 'S';
  return (
    source
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'S'
  );
}

function formatStudentId(student) {
  if (!student?.id) return '—';
  return `MRB-${String(student.id).padStart(5, '0')}`;
}

async function loadUnreadNotificationCount() {
  try {
    const response = await studentApi.notifications();
    const payload = response?.data;
    const items = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.notifications)
        ? payload.notifications
        : [];
    return items.filter((item) => item && item.isRead === false).length;
  } catch {
    return 0;
  }
}

export default function StudentProfileMenu({ onLogout }) {
  const navigate = useNavigate();
  const student = getStoredUser('student_user') || {};
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);

  const initials = getStudentInitials(student);
  const username = student.username || '—';
  const displayName = student.fullName || student.username || student.email || 'Student';
  const email = student.email || '—';
  const studentId = formatStudentId(student);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape' && open) setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    function onDocClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    loadUnreadNotificationCount()
      .then((unreadCount) => {
        if (cancelled) return;
        setNotificationCount(unreadCount);
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  function navigateTo(path) {
    closeMenu();
    navigate(path);
  }

  function handleLogoutClick() {
    closeMenu();
    onLogout();
  }

  return (
    <div className="student-profile-menu" ref={menuRef}>
      <button
        type="button"
        className="student-profile-menu__trigger"
        aria-label={`Account menu for ${displayName}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="student-profile-menu__avatar" aria-hidden>
          {initials}
        </span>
      </button>

      {open ? (
        <div className="student-profile-menu__panel" role="menu" aria-label="Student account menu">
          <header className="student-profile-menu__header">
            <span className="student-profile-menu__avatar student-profile-menu__avatar--lg" aria-hidden>
              {initials}
            </span>
            <p className="student-profile-menu__name">{displayName}</p>
            <p className="student-profile-menu__username">
              {student.username ? `@${student.username}` : '—'}
            </p>
            <dl className="student-profile-menu__details">
              <div>
                <dt>Username</dt>
                <dd>{username}</dd>
              </div>
              <div>
                <dt>Full Name</dt>
                <dd>{student.fullName || displayName}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>Student ID</dt>
                <dd>{studentId}</dd>
              </div>
            </dl>
          </header>

          <hr className="sp-divider sp-divider--gradient" aria-hidden />

          <div className="student-profile-menu__items">
            <button
              type="button"
              className="student-profile-menu__item"
              role="menuitem"
              onClick={() => navigateTo('/dashboard/my-courses')}
            >
              <span className="student-profile-menu__item-label">
                <StudentIcon name="book-open" size={18} className="student-profile-menu__item-icon" />
                My Courses
              </span>
            </button>

            <button
              type="button"
              className="student-profile-menu__item"
              role="menuitem"
              onClick={() => navigateTo('/dashboard/notifications')}
            >
              <span className="student-profile-menu__item-label">
                <StudentIcon
                  name="bell"
                  size={18}
                  className={`student-profile-menu__item-icon${notificationCount > 0 ? ' sp-icon--bell-alert' : ''}`}
                />
                Notifications
              </span>
              {notificationCount > 0 ? (
                <span className="student-profile-menu__badge" aria-label={`${notificationCount} unread`}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              className="student-profile-menu__item"
              role="menuitem"
              onClick={() => navigateTo('/dashboard/settings/profile')}
            >
              <span className="student-profile-menu__item-label">
                <StudentIcon name="user" size={18} className="student-profile-menu__item-icon" />
                My Profile
              </span>
            </button>

            <button
              type="button"
              className="student-profile-menu__item student-profile-menu__item--logout"
              role="menuitem"
              onClick={handleLogoutClick}
            >
              <span className="student-profile-menu__item-label">
                <StudentIcon name="log-out" size={18} className="student-profile-menu__item-icon" />
                Logout
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
