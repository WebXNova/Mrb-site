import { useInView } from '../../hooks/useInView';
import StudentIcon from '../icons/StudentIcons';
import StudentAnimatedStat from './StudentAnimatedStat';
import StudentProgressBar from './StudentProgressBar';

function Trend({ value }) {
  if (value == null) return null;
  const positive = value >= 0;
  return (
    <span className={`sp-stat-trend${positive ? ' sp-stat-trend--up' : ' sp-stat-trend--down'}`}>
      {positive ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

function StatCard({ icon, label, value, suffix, progress, trend, delay, inView }) {
  return (
    <article className={`sp-stat-card sp-card sp-card--interactive sp-animate-in sp-animate-in--${delay}`}>
      <div className="sp-stat-card__head">
        <span className="sp-stat-card__icon" aria-hidden>
          {icon}
        </span>
        <Trend value={trend} />
      </div>
      <div className="sp-stat-card__value">
        <StudentAnimatedStat value={value} enabled={inView} suffix={suffix} />
      </div>
      <p className="sp-stat-card__label">{label}</p>
      {progress != null ? (
        <StudentProgressBar percent={progress} inView={inView} className="sp-stat-card__bar" />
      ) : null}
    </article>
  );
}

export default function StudentDashboardStats({ data }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  const progress = data?.progress ?? {};

  return (
    <section ref={ref} className="sp-stats-row" aria-label="Learning statistics">
      <StatCard
        icon={<StudentIcon name="video" size={20} className="sp-icon--burgundy" />}
        label="Lectures completed"
        value={data?.lecturesCompleted ?? 0}
        suffix={progress.lecturesTotal ? ` / ${progress.lecturesTotal}` : ''}
        progress={progress.lecturesPercent ?? 0}
        trend={progress.lecturesPercent > 50 ? 12 : 5}
        delay={1}
        inView={inView}
      />
      <StatCard
        icon={<StudentIcon name="clipboard-check" size={20} className="sp-icon--burgundy" />}
        label="Tests attempted"
        value={data?.testsCompleted ?? 0}
        suffix={progress.testsTotal ? ` / ${progress.testsTotal}` : ''}
        progress={progress.testsPercent ?? 0}
        trend={data?.testsCompleted > 0 ? 8 : null}
        delay={2}
        inView={inView}
      />
      <StatCard
        icon={<StudentIcon name="help-circle" size={20} className="sp-icon--burgundy" />}
        label="Questions solved"
        value={data?.questionsAsked ?? 0}
        trend={data?.questionsAsked > 0 ? 4 : null}
        delay={3}
        inView={inView}
      />
      <StatCard
        icon={<StudentIcon name="award" size={20} className="sp-icon--gold" />}
        label="Overall progress"
        value={data?.progressPercent ?? 0}
        suffix="%"
        progress={data?.progressPercent ?? 0}
        trend={data?.progressPercent > 0 ? 6 : null}
        delay={4}
        inView={inView}
      />
    </section>
  );
}
