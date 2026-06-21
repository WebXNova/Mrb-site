import { motion } from 'framer-motion';
import { qaSubjectLabel } from '../../../constants/qaSubjects';
import {
  formatDuration,
  formatWhen,
  getResponseTier,
  studentInitials,
  TIER_LABELS,
} from './qaMonitoringUtils';

/**
 * @param {{ item: Record<string, unknown>, index: number }} props
 */
export default function QaTimelineCard({ item, index }) {
  const status = String(item.status || 'pending').toLowerCase();
  const isAnswered = status === 'answered';
  const tier = isAnswered ? getResponseTier(item.responseTimeSeconds) : 'pending';

  return (
    <motion.li
      className="qa-timeline-card"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
    >
      <span className={`qa-timeline-card__dot qa-timeline-card__dot--${tier}`} aria-hidden="true" />

      <header className="qa-timeline-card__header">
        <div className="qa-timeline-card__student">
          <div className="qa-timeline-card__student-avatar">
            {studentInitials(item.studentName)}
          </div>
          <div>
            <div className="qa-timeline-card__student-name">
              {item.studentName || `Student #${item.studentId}`}
            </div>
            <div className="qa-timeline-card__student-meta">
              {item.studentEmail || '—'}
              {item.subject ? ` · ${qaSubjectLabel(item.subject) || item.subject}` : ''}
            </div>
          </div>
        </div>

        <div className="qa-timeline-card__badges">
          <span className={`qa-status-pill qa-status-pill--${status}`}>
            {status}
          </span>
          <span className={`qa-response-badge qa-response-badge--${tier}`}>
            {TIER_LABELS[tier]}
            {isAnswered ? ` · ${formatDuration(item.responseTimeSeconds)}` : ''}
          </span>
        </div>
      </header>

      <div className="qa-timeline-card__block">
        <div className="qa-timeline-card__block-label">Question</div>
        <div className="qa-timeline-card__block-content">
          {item.question || item.title || '—'}
        </div>
      </div>

      {isAnswered && item.answer ? (
        <div className="qa-timeline-card__block">
          <div className="qa-timeline-card__block-label">Teacher answer</div>
          <div className="qa-timeline-card__block-content qa-timeline-card__block-content--answer">
            {item.answer}
          </div>
          {item.teacherName ? (
            <div className="qa-timeline-card__student-meta" style={{ marginTop: '0.5rem' }}>
              — {item.teacherName}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="qa-timeline-card__block">
          <div className="qa-timeline-card__block-label">Teacher answer</div>
          <div className="qa-timeline-card__block-content" style={{ color: 'var(--qa-muted)', fontStyle: 'italic' }}>
            Pending teacher response
          </div>
        </div>
      )}

      <div className="qa-timeline-card__times">
        <div className="qa-timeline-card__time-item">
          <span className="qa-timeline-card__time-label">Question time</span>
          <span className="qa-timeline-card__time-value">{formatWhen(item.createdAt)}</span>
        </div>
        <div className="qa-timeline-card__time-item">
          <span className="qa-timeline-card__time-label">Answer time</span>
          <span className="qa-timeline-card__time-value">{formatWhen(item.answeredAt)}</span>
        </div>
        <div className="qa-timeline-card__time-item">
          <span className="qa-timeline-card__time-label">Response duration</span>
          <span className="qa-timeline-card__time-value">
            {isAnswered ? formatDuration(item.responseTimeSeconds) : '—'}
          </span>
        </div>
      </div>
    </motion.li>
  );
}
