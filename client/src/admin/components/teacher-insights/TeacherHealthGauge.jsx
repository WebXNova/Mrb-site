import { motion } from 'framer-motion';
import { useAnimatedStat } from '../../../student/hooks/useAnimatedStat';

const TIER_COLORS = {
  excellent: 'var(--ti-excellent)',
  good: 'var(--ti-good)',
  average: 'var(--ti-average)',
  needs_attention: 'var(--ti-attention)',
};

const COMPONENT_LABELS = {
  responseSpeed: 'Response speed',
  activityFrequency: 'Activity frequency',
  questionsAnswered: 'Questions answered',
  consistency: 'Consistency',
  studentEngagement: 'Student engagement',
};

/**
 * @param {{ health: { score: number, label: string, tier: string, components?: Record<string, number> }|null, loading?: boolean }} props
 */
export default function TeacherHealthGauge({ health, loading = false }) {
  if (loading || !health) {
    return (
      <div className="ti-card ti-health">
        <div className="ti-skeleton" style={{ height: 200, borderRadius: 12 }} aria-busy="true" />
      </div>
    );
  }

  const { value: animatedScore } = useAnimatedStat(health.score, { duration: 1000 });
  const color = TIER_COLORS[health.tier] || TIER_COLORS.good;
  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <motion.div
      className="ti-card ti-health"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <h3 className="ti-section-title">Teacher Health Score</h3>
      <div className="ti-health__ring" role="meter" aria-valuenow={health.score} aria-valuemin={0} aria-valuemax={100}>
        <svg width="160" height="160" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="70" fill="none" stroke="var(--ti-border)" strokeWidth="10" />
          <motion.circle
            cx="80"
            cy="80"
            r="70"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="ti-health__score">
          <strong style={{ color }}>{animatedScore}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <div className={`ti-health__label ti-health__label--${health.tier}`}>{health.label}</div>

      {health.components ? (
        <div className="ti-health__components">
          {Object.entries(health.components).map(([key, val]) => (
            <div key={key} className="ti-health__row">
              <span className="ti-health__row-label">{COMPONENT_LABELS[key] || key}</span>
              <div className="ti-health__row-bar">
                <motion.div
                  className="ti-health__row-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${val}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                />
              </div>
              <span className="ti-health__row-val">{Math.round(val)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}
