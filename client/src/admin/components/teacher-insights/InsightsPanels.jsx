import { motion, AnimatePresence } from 'framer-motion';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';

function formatRelative(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * @param {{ alerts: Record<string, unknown>[], loading?: boolean }} props
 */
export default function InsightsAlerts({ alerts = [], loading = false }) {
  if (loading) {
    return (
      <div className="ti-card">
        <h3 className="ti-section-title">Alerts</h3>
        <div className="ti-skeleton" style={{ height: 80 }} />
      </div>
    );
  }

  return (
    <div className="ti-card">
      <h3 className="ti-section-title">Intelligence alerts</h3>
      {!alerts.length ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--ti-muted)', margin: 0 }}>
          No alerts — all teachers within normal parameters.
        </p>
      ) : (
        <div className="ti-alerts" role="list" aria-live="polite">
          <AnimatePresence initial={false}>
            {alerts.map((alert, i) => (
              <motion.div
                key={`${alert.type}-${alert.teacherId}-${i}`}
                className={`ti-alert${alert.severity === 'critical' ? ' ti-alert--critical' : ''}`}
                role="listitem"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <span className="ti-alert__icon" aria-hidden="true">
                  {alert.severity === 'critical' ? (
                    <ErrorOutlineOutlinedIcon sx={{ fontSize: 18 }} />
                  ) : (
                    <WarningAmberOutlinedIcon sx={{ fontSize: 18 }} />
                  )}
                </span>
                <div>
                  <div className="ti-alert__message">
                    {alert.teacherName ? `${alert.teacherName}: ` : ''}
                    {alert.message}
                  </div>
                  {alert.detail ? <div className="ti-alert__detail">{alert.detail}</div> : null}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/**
 * @param {{
 *   leaderboard: Record<string, unknown>|null,
 *   onSelectTeacher: (id: number) => void,
 *   loading?: boolean,
 * }} props
 */
export function InsightsLeaderboardPanel({ leaderboard, onSelectTeacher, loading = false }) {
  if (loading || !leaderboard) {
    return (
      <div className="ti-card">
        <h3 className="ti-section-title">Admin insight panel</h3>
        <div className="ti-skeleton" style={{ height: 200 }} />
      </div>
    );
  }

  const items = [
    {
      key: 'mostActive',
      label: 'Most active',
      teacher: leaderboard.mostActiveTeacher,
      metric: (t) => (t ? `Score ${t.activityScore}` : '—'),
    },
    {
      key: 'fastest',
      label: 'Fastest responder',
      teacher: leaderboard.fastestTeacher,
      metric: (t) => (t?.avgResponseSeconds != null ? `${Math.round(t.avgResponseSeconds / 60)}m avg` : '—'),
    },
    {
      key: 'workload',
      label: 'Highest workload',
      teacher: leaderboard.highestWorkload,
      metric: (t) => (t ? `${t.totalAssigned} assigned` : '—'),
    },
    {
      key: 'pending',
      label: 'Most pending',
      teacher: leaderboard.pendingLeaderboard?.[0],
      metric: (t) => (t ? `${t.pending} pending` : '—'),
    },
  ];

  return (
    <div className="ti-card">
      <h3 className="ti-section-title">Admin insight panel</h3>
      <ul className="ti-insight-list">
        {items.map((item, i) => (
          <motion.li key={item.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            {item.teacher ? (
              <button
                type="button"
                className="ti-insight-item"
                onClick={() => onSelectTeacher(item.teacher.teacherId)}
              >
                <div>
                  <div className="ti-insight-item__label">{item.label}</div>
                  <div className="ti-insight-item__name">{item.teacher.teacherName}</div>
                </div>
                <span className="ti-insight-item__metric">{item.metric(item.teacher)}</span>
              </button>
            ) : (
              <div className="ti-insight-item" style={{ cursor: 'default' }}>
                <div>
                  <div className="ti-insight-item__label">{item.label}</div>
                  <div className="ti-insight-item__name">—</div>
                </div>
              </div>
            )}
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{ items: Record<string, unknown>[], loading?: boolean }} props
 */
export function InsightsActivityFeed({ items = [], loading = false }) {
  if (loading && !items.length) {
    return (
      <div className="ti-card">
        <h3 className="ti-section-title">Activity feed</h3>
        <div className="ti-skeleton" style={{ height: 160 }} />
      </div>
    );
  }

  return (
    <div className="ti-card">
      <h3 className="ti-section-title">Live activity feed</h3>
      <ul className="ti-feed" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              className="ti-feed__item"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              layout
            >
              <span className="ti-feed__dot" aria-hidden="true" />
              <div>
                <div className="ti-feed__message">{item.message}</div>
                <time className="ti-feed__time" dateTime={item.createdAt}>
                  {formatRelative(item.createdAt)}
                  {' · '}
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                </time>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {!items.length ? (
          <li style={{ fontSize: '0.8125rem', color: 'var(--ti-muted)' }}>No recent activity</li>
        ) : null}
      </ul>
    </div>
  );
}
