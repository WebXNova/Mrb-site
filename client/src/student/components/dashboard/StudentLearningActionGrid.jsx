import { Link } from 'react-router-dom';
import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';

function ActionCard({ title, icon, items, to, delay, inView }) {
  return (
    <article className={`sp-action-card sp-card sp-card--interactive sp-animate-in sp-animate-in--${delay}`}>
      <header className="sp-action-card__header">
        <span className="sp-action-card__icon" aria-hidden>
          <StudentIcon name={icon} size={22} className="sp-icon--burgundy" />
        </span>
        <h3 className="sp-action-card__title">{title}</h3>
      </header>
      <ul className="sp-action-card__list">
        {items.map((item) => (
          <li key={item.label}>
            <span className="sp-action-card__item-label">{item.label}</span>
            {item.value != null ? (
              <span className="sp-action-card__item-value">{item.value}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {to ? (
        <Link to={to} className="sp-action-card__link sp-link">
          Open →
        </Link>
      ) : null}
    </article>
  );
}

export default function StudentLearningActionGrid({ data, notificationCount = 0 }) {
  const [ref, inView] = useInView({ threshold: 0.1 });
  const progress = data?.progress ?? {};
  const completion = Math.round(data?.progressPercent ?? 0);

  return (
    <section ref={ref} className="sp-action-grid" aria-label="Learning actions">
      <ActionCard
        title="Course progress"
        icon="layers"
        delay={3}
        inView={inView}
        to="/dashboard/my-courses"
        items={[
          { label: 'Lectures', value: `${data?.lecturesCompleted ?? 0}${progress.lecturesTotal ? ` / ${progress.lecturesTotal}` : ''}` },
          { label: 'Results', value: data?.results?.length ?? 0 },
          { label: 'Doubts', value: data?.questionsAsked ?? 0 },
          { label: 'Completion', value: `${completion}%` },
        ]}
      />
      <ActionCard
        title="Learning center"
        icon="book-open"
        delay={4}
        inView={inView}
        to="/dashboard/lectures"
        items={[
          { label: 'Continue learning' },
          { label: 'Resume last topic' },
        ]}
      />
      <ActionCard
        title="Practice center"
        icon="clipboard-check"
        delay={5}
        inView={inView}
        to="/dashboard/tests"
        items={[
          { label: 'Available tests', value: data?.tests?.length ?? 0 },
          { label: 'Question bank' },
          { label: 'Mock exams' },
        ]}
      />
      <ActionCard
        title="Support"
        icon="help-circle"
        delay={6}
        inView={inView}
        to="/student/questions?tab=ask"
        items={[
          { label: 'Ask doubt' },
          { label: 'Contact support' },
        ]}
      />
      <ActionCard
        title="Updates"
        icon="bell"
        delay={7}
        inView={inView}
        to="/dashboard/notifications"
        items={[
          { label: 'Notifications', value: notificationCount },
          { label: 'Announcements' },
        ]}
      />
    </section>
  );
}
