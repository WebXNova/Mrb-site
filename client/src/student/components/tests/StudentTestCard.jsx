import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import StudentIcon from '../icons/StudentIcons';

const SUBJECT_CHIP_LIMIT = 2;

function statusLabel(status) {
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  return 'Not attempted';
}

function statusTone(status) {
  if (status === 'in_progress') return 'student-test-card__badge--progress';
  if (status === 'completed') return 'student-test-card__badge--done';
  return 'student-test-card__badge--new';
}

function actionLabel(status) {
  if (status === 'in_progress') return 'Resume test';
  if (status === 'completed') return 'View results';
  return 'Start test';
}

function ctaTone(status) {
  if (status === 'completed') return 'student-test-card__cta--results';
  return 'student-test-card__cta--start';
}

function subjectChips(test) {
  const parts = String(test.subject_label || test.category || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const labels = parts.length ? parts : ['General'];
  const extra = Math.max(0, labels.length - SUBJECT_CHIP_LIMIT);
  return {
    shown: extra ? labels.slice(0, SUBJECT_CHIP_LIMIT) : labels,
    extra,
  };
}

function attemptsLabel(test) {
  const used = Number(test.attempts_used ?? 0);
  const max = Number(test.max_attempts);
  if (Number.isFinite(max) && max > 0) return `${used}/${max} attempts`;
  if (used > 0) return `${used} attempts`;
  return null;
}

export default function StudentTestCard({ test, index = 0 }) {
  const reduceMotion = useReducedMotion();
  const slug = test.public_slug || test.slug;
  const href = slug ? `/tests/${encodeURIComponent(String(slug))}` : null;
  const resultsHref =
    test.status === 'completed' && slug ? `/dashboard/tests/history` : href;

  const linkTo = test.status === 'completed' ? resultsHref : href;
  const duration = Number(test.duration_minutes ?? test.durationMinutes ?? 0);
  const { shown: subjects, extra: extraSubjects } = subjectChips(test);
  const attempts = attemptsLabel(test);
  const questionCount = Number(test.question_count);

  return (
    <motion.article
      className="student-test-card"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { duration: 0.35, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <div className="student-test-card__head">
        <h3 className="student-test-card__title" title={test.title}>
          {test.title}
        </h3>
        <span className={`student-test-card__badge ${statusTone(test.status)}`}>
          {statusLabel(test.status)}
        </span>
      </div>

      <ul className="student-test-card__subjects" aria-label="Subjects">
        {subjects.map((label, chipIndex) => (
          <li key={`${label}-${chipIndex}`} className="student-test-card__chip" title={label}>
            {label}
          </li>
        ))}
        {extraSubjects > 0 ? (
          <li className="student-test-card__chip student-test-card__chip--more">+{extraSubjects}</li>
        ) : null}
      </ul>

      <ul className="student-test-card__meta">
        <li className="student-test-card__meta-item">
          <StudentIcon name="clock" size={14} className="student-test-card__meta-icon" />
          <span>{duration > 0 ? `${duration} min` : '—'}</span>
        </li>
        {questionCount > 0 ? (
          <li className="student-test-card__meta-item">
            <StudentIcon name="clipboard-check" size={14} className="student-test-card__meta-icon" />
            <span>
              {questionCount} {questionCount === 1 ? 'question' : 'questions'}
            </span>
          </li>
        ) : null}
        {attempts ? (
          <li className="student-test-card__meta-item">
            <StudentIcon name="repeat" size={14} className="student-test-card__meta-icon" />
            <span>{attempts}</span>
          </li>
        ) : null}
      </ul>

      <div className="student-test-card__actions">
        {linkTo ? (
          <Link
            className={`student-test-card__cta ${ctaTone(test.status)}`}
            to={linkTo}
          >
            {actionLabel(test.status)}
          </Link>
        ) : (
          <span className="student-test-card__unavailable">Test link unavailable</span>
        )}
      </div>
    </motion.article>
  );
}
