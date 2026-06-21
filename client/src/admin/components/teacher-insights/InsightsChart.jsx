/**
 * Lightweight SVG area/line chart for insights dashboards.
 */

function buildPoints(data, width, height, padding = 8) {
  if (!data?.length) return [];
  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 1);
  const min = 0;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  return data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * innerW;
    const v = Number(d.value) || 0;
    const y = padding + innerH - ((v - min) / (max - min)) * innerH;
    return { x, y, ...d };
  });
}

function toAreaPath(points, height, padding = 8) {
  if (!points.length) return '';
  const baseline = height - padding;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const close = `L${points[points.length - 1].x},${baseline} L${points[0].x},${baseline} Z`;
  return `${line} ${close}`;
}

function toLinePath(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
}

/**
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   data: { date?: string, month?: string, label?: string, value: number }[],
 *   height?: number,
 *   color?: string,
 *   formatValue?: (v: number) => string,
 *   variant?: 'area' | 'line',
 * }} props
 */
export default function InsightsChart({
  title,
  subtitle,
  data = [],
  height = 120,
  color = '#6366f1',
  formatValue = (v) => String(v),
  variant = 'area',
}) {
  const width = 320;
  const points = buildPoints(data, width, height);
  const areaPath = toAreaPath(points, height);
  const linePath = toLinePath(points);
  const last = data[data.length - 1];

  if (!data.length) {
    return (
      <div className="ti-chart" role="img" aria-label={`${title} — no data`}>
        <div className="ti-chart__title">{title}</div>
        {subtitle ? <div className="ti-chart__subtitle">{subtitle}</div> : null}
        <div className="ti-chart__empty">No data for this period</div>
      </div>
    );
  }

  return (
    <div className="ti-chart" role="img" aria-label={`${title} chart`}>
      <div className="ti-chart__title">{title}</div>
      {subtitle ? <div className="ti-chart__subtitle">{subtitle}</div> : null}
      <svg
        className="ti-chart__svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`grad-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {variant === 'area' ? (
          <path d={areaPath} fill={`url(#grad-${title.replace(/\s/g, '')})`} />
        ) : null}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.length > 0 ? (
          <circle
            cx={points[points.length - 1].x}
            cy={points[points.length - 1].y}
            r="3"
            fill={color}
          />
        ) : null}
      </svg>
      {last ? (
        <div className="ti-chart__subtitle">
          Latest: {formatValue(last.value)}
          {last.date ? ` · ${last.date}` : last.month ? ` · ${last.month}` : ''}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Horizontal bar chart for subject workload.
 */
export function SubjectWorkloadChart({ data = [] }) {
  const max = Math.max(...data.map((d) => d.total), 1);

  if (!data.length) {
    return (
      <div className="ti-chart">
        <div className="ti-chart__title">Subject workload</div>
        <div className="ti-chart__empty">No assigned questions yet</div>
      </div>
    );
  }

  return (
    <div className="ti-chart">
      <div className="ti-chart__title">Subject workload</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {data.map((row) => (
          <div key={row.subject}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{row.subject?.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--ti-muted)' }}>
                {row.total} total · {row.pending} pending
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--ti-border)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(row.total / max) * 100}%`,
                  height: '100%',
                  background: 'var(--ti-accent)',
                  borderRadius: 999,
                  transition: 'width 0.5s ease',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
