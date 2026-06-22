import { useEffect, useState } from 'react';
import { useStudentTheme } from '../../../student/context/StudentThemeContext';

const DOC_ICON = 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z';
const CHECK_ICON = 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z';
const CLOSE_ICON = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
const TRENDING_ICON = 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z';

function resolveCardTheme(hasBlueElement, isDark) {
  if (isDark) {
    return 'th-stats__card th-stats__card--dark-blue';
  }
  return hasBlueElement ? 'th-stats__card th-stats__card--dark' : 'th-stats__card';
}

function ProgressRing({ percentage, colorClass, iconPath }) {
  const radius = 18;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference;

  return (
    <svg className="th-stats__ring" width="48" height="48" viewBox="0 0 48 48">
      <circle
        className="th-stats__ring-bg"
        cx="24"
        cy="24"
        r={radius}
        strokeWidth={stroke}
        fill="transparent"
      />
      <circle
        className={`th-stats__ring-fill ${colorClass}`}
        cx="24"
        cy="24"
        r={radius}
        strokeWidth={stroke}
        fill="transparent"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
      {iconPath && (
        <path
          className="th-stats__ring-icon"
          d={iconPath}
          fill="currentColor"
          transform="translate(16, 16) scale(0.66)"
        />
      )}
    </svg>
  );
}

export default function HistoryStatsCards({ statistics }) {
  const { isDark } = useStudentTheme();
  
  const total = statistics?.totalTests || 0;
  const passed = statistics?.passedTests || 0;
  const failed = statistics?.failedTests || 0;
  const avg = statistics?.averagePercentage || 0;

  const passedPct = total > 0 ? (passed / total) * 100 : 0;
  const failedPct = total > 0 ? (failed / total) * 100 : 0;

  const [animatedPct, setAnimatedPct] = useState({
    passed: 0,
    failed: 0,
    average: 0,
  });

  useEffect(() => {
    if (!statistics) return;
    
    // Reset to 0 first to animate from 0 on data change
    setAnimatedPct({
      passed: 0,
      failed: 0,
      average: 0,
    });

    const timer = setTimeout(() => {
      setAnimatedPct({
        passed: passedPct,
        failed: failedPct,
        average: avg,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [statistics, passedPct, failedPct, avg]);

  if (!statistics) return null;

  const cards = [
    {
      id: 'total',
      label: 'Total tests',
      value: statistics.totalTests,
      hasBlueElement: true,
      percentage: 100,
      colorClass: 'th-stats__ring-fill--total',
      iconPath: DOC_ICON,
    },
    {
      id: 'passed',
      label: 'Passed',
      value: statistics.passedTests,
      valueClass: 'th-stats__value--pass',
      percentage: animatedPct.passed,
      colorClass: 'th-stats__ring-fill--pass',
      iconPath: CHECK_ICON,
    },
    {
      id: 'failed',
      label: 'Failed',
      value: statistics.failedTests,
      valueClass: 'th-stats__value--fail',
      percentage: animatedPct.failed,
      colorClass: 'th-stats__ring-fill--fail',
      iconPath: CLOSE_ICON,
    },
    {
      id: 'average',
      label: 'Average percentage',
      value: statistics.averagePercentage == null ? '—' : `${statistics.averagePercentage}%`,
      hasBlueElement: true,
      percentage: animatedPct.average,
      colorClass: 'th-stats__ring-fill--average',
      iconPath: TRENDING_ICON,
    },
  ];

  return (
    <section className="th-stats" aria-labelledby="th-stats-heading">
      <h2 id="th-stats-heading" className="visually-hidden">
        Results statistics
      </h2>
      <div className="th-stats__grid">
        {cards.map((card) => (
          <article key={card.id} className={resolveCardTheme(Boolean(card.hasBlueElement), isDark)}>
            <div className="th-stats__card-content">
              <div className="th-stats__card-info">
                <p className="th-stats__label">{card.label}</p>
                <p className={`th-stats__value ${card.valueClass ?? ''}`.trim()}>{card.value}</p>
              </div>
              <div className="th-stats__card-visual">
                <ProgressRing
                  percentage={card.percentage}
                  colorClass={card.colorClass}
                  iconPath={card.iconPath}
                />
              </div>
            </div>
            <div className="th-stats__accent" aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}
