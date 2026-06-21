import { useInView } from '../../hooks/useInView';
import StudentAnimatedStat from './StudentAnimatedStat';
import StudentProgressBar from './StudentProgressBar';

function Milestone({ label, completed, total, percent, inView }) {
  const isComplete = total > 0 && completed >= total;
  const isStarted = completed > 0;

  return (
    <li
      className={`sd-quest__milestone${isComplete ? ' sd-quest__milestone--done' : ''}${isStarted ? ' sd-quest__milestone--started' : ''}`}
    >
      <span className="sd-quest__checkpoint" aria-hidden>
        {isComplete ? <span className="student-complete-check">✓</span> : null}
      </span>
      <div className="sd-quest__content">
        <p className="sd-quest__label">{label}</p>
        <StudentAnimatedStat
          value={completed}
          enabled={inView}
          className="sd-stat--sm"
          suffix={total != null ? ` / ${total}` : ''}
        />
        <StudentProgressBar percent={percent} inView={inView} />
        <div className="sd-body">
          <StudentAnimatedStat value={percent} enabled={inView} inline suffix="%" /> complete
        </div>
      </div>
    </li>
  );
}

export default function StudentQuestMap({ data, delayClass = 'sd-card--delay-1' }) {
  const [ref, inView] = useInView({ threshold: 0.2 });
  const progress = data?.progress ?? {};
  const lecturesTotal = progress.lecturesTotal ?? data?.lectures?.length ?? 0;
  const testsTotal = progress.testsTotal ?? data?.tests?.length ?? 0;
  const questionsTotal = Math.max(data?.questionsAsked ?? 0, 1);

  const milestones = [
    {
      label: 'Lectures',
      completed: data?.lecturesCompleted ?? 0,
      total: lecturesTotal,
      percent: progress.lecturesPercent ?? 0,
    },
    {
      label: 'Tests',
      completed: data?.testsCompleted ?? 0,
      total: testsTotal,
      percent: progress.testsPercent ?? 0,
    },
    {
      label: 'Questions',
      completed: data?.questionsAsked ?? 0,
      total: null,
      percent: Math.min(100, Math.round(((data?.questionsAsked ?? 0) / questionsTotal) * 100)),
    },
  ];

  return (
    <article ref={ref} className={`sd-quest sd-card ${delayClass}`}>
      <h2 className="sd-card__title sd-card__title--section">Your Quest Map</h2>
      <ol className="sd-quest__timeline">
        {milestones.map((item) => (
          <Milestone key={item.label} {...item} inView={inView} />
        ))}
      </ol>
    </article>
  );
}
