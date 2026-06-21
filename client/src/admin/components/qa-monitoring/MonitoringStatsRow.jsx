import { motion } from 'framer-motion';
import { useAnimatedStat } from '../../../student/hooks/useAnimatedStat';

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(Number(seconds))) return '—';
  const s = Number(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function formatWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatValue({ value, format }) {
  const isNumber = typeof value === 'number' && format !== 'duration' && format !== 'datetime';
  const { value: animated } = useAnimatedStat(isNumber ? value : 0, {
    enabled: isNumber,
    duration: 900,
  });

  if (format === 'duration') return formatDuration(value);
  if (format === 'datetime') return formatWhen(value);
  if (isNumber) return animated;
  return value ?? '—';
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  }),
};

/**
 * @param {{ stats: Record<string, unknown>|null, loading?: boolean }} props
 */
export default function MonitoringStatsRow({ stats, loading = false }) {
  const items = [
    { key: 'total', label: 'Total Questions', value: stats?.totalQuestions ?? 0, format: 'number' },
    { key: 'answered', label: 'Answered', value: stats?.totalAnswered ?? 0, format: 'number' },
    { key: 'pending', label: 'Pending', value: stats?.totalPending ?? 0, format: 'number' },
    {
      key: 'response',
      label: 'Avg Response Time',
      value: stats?.averageResponseTimeSeconds,
      format: 'duration',
    },
    {
      key: 'score',
      label: 'Activity Score',
      value: stats?.activityScore ?? stats?.mostActiveTeacher?.activityScore ?? 0,
      format: 'number',
    },
    {
      key: 'last',
      label: 'Last Activity',
      value: stats?.lastActivity,
      format: 'datetime',
      small: true,
    },
  ];

  if (loading) {
    return (
      <div className="qa-stats">
        {items.map((item) => (
          <div key={item.key} className="qa-skeleton qa-skeleton--stat" aria-hidden="true" />
        ))}
      </div>
    );
  }

  return (
    <div className="qa-stats">
      {items.map((item, i) => (
        <motion.div
          key={item.key}
          className="qa-stat-card"
          custom={i}
          initial="hidden"
          animate="visible"
          variants={cardVariants}
          whileHover={{ y: -2 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          <span className="qa-stat-card__label">{item.label}</span>
          <div className={`qa-stat-card__value${item.small ? ' qa-stat-card__value--sm' : ''}`}>
            <StatValue value={item.value} format={item.format} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}
