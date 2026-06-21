import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';
import StudentAnimatedStat from './StudentAnimatedStat';

function QuickLink({ to, iconName, label, stat, statSuffix, inView, delay, notifyCount = 0 }) {
  return (
    <Link to={to} className={`sp-quick-link sp-card sp-card--interactive sp-animate-in sp-animate-in--${delay}`}>
      <span className="sp-quick-link__icon-wrap">
        <span className="sp-quick-link__icon" aria-hidden>
          <StudentIcon
            name={iconName}
            size={24}
            className={`sp-icon--burgundy${notifyCount > 0 && iconName === 'bell' ? ' sp-icon--bell-alert' : ''}`}
          />
        </span>
        {notifyCount > 0 ? (
          <span className="sp-quick-link__badge" aria-label={`${notifyCount} unread notifications`}>
            {notifyCount > 99 ? '99+' : notifyCount}
          </span>
        ) : null}
      </span>
      <p className="sp-quick-link__label">{label}</p>
      {statSuffix && !stat && statSuffix !== 'Ask a doubt' ? (
        <p className="sp-quick-link__hint">{statSuffix}</p>
      ) : statSuffix === 'Ask a doubt' ? (
        <p className="sp-quick-link__cta">{statSuffix}</p>
      ) : (
        <>
          <StudentAnimatedStat value={stat} enabled={inView} className="sp-quick-link__stat" />
          <p className="sp-quick-link__hint">{statSuffix}</p>
        </>
      )}
    </Link>
  );
}

export default function StudentDashboardBottomGrid({
  lecturesCompleted,
  testsAvailable,
  notificationCount,
}) {
  const [ref, inView] = useInView({ threshold: 0.15 });

  return (
    <section ref={ref} className="sp-quick-grid" aria-label="Dashboard shortcuts">
      <QuickLink
        to="/dashboard/lectures"
        iconName="video"
        label="Learning"
        stat={lecturesCompleted}
        statSuffix="completed"
        delay={5}
        inView={inView}
      />
      <QuickLink
        to="/dashboard/tests"
        iconName="clipboard-check"
        label="Practice"
        stat={testsAvailable}
        statSuffix="available"
        delay={6}
        inView={inView}
      />
      <QuickLink
        to="/student/questions?tab=ask"
        iconName="help-circle"
        label="Support"
        statSuffix="Ask a doubt"
        delay={7}
        inView={inView}
      />
      <QuickLink
        to="/dashboard/notifications"
        iconName="bell"
        label="Updates"
        stat={notificationCount}
        statSuffix="notifications"
        delay={8}
        inView={inView}
        notifyCount={notificationCount}
      />
    </section>
  );
}
