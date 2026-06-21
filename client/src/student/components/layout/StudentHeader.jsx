import { useEffect, useState } from 'react';

import { studentApi } from '../../../api/studentApi';

import { normaliseStudentDashboard } from '../../utils/normaliseStudentDashboard';

import { useStudentTheme } from '../../context/StudentThemeContext';

import { StudentNotificationBell } from './StudentGlobalSearch';

import StudentProfileMenu from '../StudentProfileMenu';

import StudentIcon from '../icons/StudentIcons';



export default function StudentHeader({ onToggleNav, navOpen, onLogout }) {

  const { theme, toggleTheme } = useStudentTheme();

  const [notificationCount, setNotificationCount] = useState(0);



  useEffect(() => {

    let cancelled = false;



    async function loadCount() {

      try {

        const response = await studentApi.dashboard();

        if (cancelled) return;

        const data = normaliseStudentDashboard(response?.data);

        setNotificationCount((data.notifications || []).filter((n) => n && n.isRead === false).length);

      } catch {

        try {

          const response = await studentApi.notifications();

          if (cancelled) return;

          const payload = response?.data;

          const items = Array.isArray(payload)

            ? payload

            : Array.isArray(payload?.notifications)

              ? payload.notifications

              : [];

          setNotificationCount(items.filter((n) => n && n.isRead === false).length);

        } catch {

          /* ignore */

        }

      }

    }



    loadCount();

    return () => {

      cancelled = true;

    };

  }, []);



  return (

    <header className="sp-app-header" role="banner">

      <div className="sp-app-header__start">

        <button

          type="button"

          className="sp-app-header__menu"

          aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}

          aria-expanded={navOpen}

          aria-controls="student-sidebar-nav"

          onClick={onToggleNav}

        >

          <StudentIcon name="menu" size={22} />

        </button>

      </div>



      <div className="sp-app-header__end">

        <button

          type="button"

          className="sp-app-header__theme"

          onClick={toggleTheme}

          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}

        >

          {theme === 'dark' ? '☀' : '☾'}

        </button>

        <StudentNotificationBell count={notificationCount} />

        <StudentProfileMenu onLogout={onLogout} />

      </div>

    </header>

  );

}


