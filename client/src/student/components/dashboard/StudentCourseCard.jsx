import { Link } from 'react-router-dom';
import StudentProgressBar from './StudentProgressBar';
import { useInView } from '../../hooks/useInView';

function Badge({ children, tone = 'navy' }) {
  return <span className={`sp-badge sp-badge--${tone}`}>{children}</span>;
}

export default function StudentCourseCard({ data }) {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const course = data?.courses?.[0] || null;
  const progress = data?.progress ?? {};
  const progressPercent = Number.isFinite(Number(data?.progressPercent))
    ? Number(data.progressPercent)
    : progress.lecturesPercent ?? 0;

  const title = course?.title || course?.name || 'Your enrolled course';
  const phase = course?.phase || course?.batchPhase || null;
  const subject = course?.subject || course?.subjectName || null;

  return (
    <article ref={ref} className="sp-course-card sp-card sp-card--interactive sp-animate-in sp-animate-in--2">
      <div className="sp-course-card__header">
        <div>
          <p className="sp-label">Active course</p>
          <h2 className="sp-course-card__title">{title}</h2>
        </div>
        <Link to="/dashboard/my-courses" className="sp-btn sp-btn--ghost sp-btn--sm">
          View course
        </Link>
      </div>

      <div className="sp-course-card__badges">
        {phase ? <Badge tone="gold">{phase}</Badge> : null}
        {subject ? <Badge tone="sage">{subject}</Badge> : null}
        <Badge tone="navy">{data?.lecturesCompleted ?? 0} lectures done</Badge>
      </div>

      <div className="sp-course-card__progress">
        <div className="sp-course-card__progress-meta">
          <span className="sp-label">Course progress</span>
          <span className="sp-course-card__pct">{Math.round(progressPercent)}%</span>
        </div>
        <StudentProgressBar percent={progressPercent} inView={inView} />
      </div>

      <div className="sp-course-card__grid">
        <div className="sp-course-card__metric">
          <span className="sp-course-card__metric-value">{data?.tests?.length ?? 0}</span>
          <span className="sp-course-card__metric-label">Tests available</span>
        </div>
        <div className="sp-course-card__metric">
          <span className="sp-course-card__metric-value">{data?.results?.length ?? 0}</span>
          <span className="sp-course-card__metric-label">Results recorded</span>
        </div>
        <div className="sp-course-card__metric">
          <span className="sp-course-card__metric-value">{data?.questionsAsked ?? 0}</span>
          <span className="sp-course-card__metric-label">Doubts asked</span>
        </div>
        <div className="sp-course-card__metric">
          <span className="sp-course-card__metric-value">{progress.lecturesTotal ?? data?.lectures?.length ?? 0}</span>
          <span className="sp-course-card__metric-label">Total lectures</span>
        </div>
      </div>
    </article>
  );
}
