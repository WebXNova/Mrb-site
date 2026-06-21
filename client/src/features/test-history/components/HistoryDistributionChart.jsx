import { useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { useIsStudentMobileNav } from '../../../student/hooks/useMediaQuery';
import { buildDistributionChartData } from '../utils/buildChartData';
import { createCenterTextPlugin, ensureHistoryChartsRegistered } from '../utils/chartSetup';

ensureHistoryChartsRegistered();

/**
 * Donut chart — passed / failed / pending distribution.
 * @param {{ statistics?: Record<string, unknown>, items?: Array<Record<string, unknown>> }} props
 */
export default function HistoryDistributionChart({ statistics, items = [] }) {
  const isMobile = useIsStudentMobileNav();
  const distribution = useMemo(
    () => buildDistributionChartData(statistics, items),
    [statistics, items]
  );

  const centerSublabel = `${distribution.total} total test${distribution.total === 1 ? '' : 's'}`;

  const data = useMemo(
    () => ({
      labels: distribution.slices.map((slice) => slice.label),
      datasets: [
        {
          data: distribution.slices.map((slice) => slice.value),
          backgroundColor: distribution.slices.map((slice) => slice.color),
          borderColor: '#0B0E14',
          borderWidth: 3,
          hoverOffset: 6,
        },
      ],
    }),
    [distribution.slices]
  );

  const plugins = useMemo(
    () => [
      createCenterTextPlugin({
        title: distribution.passRate == null ? 'No graded tests' : 'Overall Pass Rate',
        value: distribution.passRate == null ? '' : `${distribution.passRate}%`,
        sublabel: centerSublabel,
      }),
    ],
    [distribution.passRate, centerSublabel]
  );

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: isMobile ? '58%' : '62%',
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: {
            color: '#CBD5E1',
            boxWidth: 12,
            boxHeight: 12,
            padding: isMobile ? 10 : 14,
            generateLabels(chart) {
              const dataset = chart.data.datasets[0];
              const total = dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
              return chart.data.labels.map((label, index) => {
                const value = Number(dataset.data[index] || 0);
                const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                return {
                  text: `${label}: ${value} (${pct}%)`,
                  fillStyle: dataset.backgroundColor[index],
                  hidden: false,
                  index,
                };
              });
            },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#E2E8F0',
          borderColor: 'rgba(59, 130, 246, 0.45)',
          borderWidth: 1,
          callbacks: {
            label(context) {
              const total = context.dataset.data.reduce((sum, value) => sum + Number(value || 0), 0);
              const value = Number(context.raw || 0);
              const pct = total > 0 ? Math.round((value / total) * 100) : 0;
              return `${context.label}: ${value} (${pct}%)`;
            },
          },
        },
      },
    }),
    [isMobile]
  );

  const hasData = distribution.slices.some((slice) => slice.value > 0);

  if (!hasData) {
    return (
      <div className="th-chart-card th-chart-card--dark">
        <h3 className="th-chart-card__title">Result distribution</h3>
        <p className="th-chart-card__empty">No result data to chart yet.</p>
      </div>
    );
  }

  return (
    <div className="th-chart-card th-chart-card--dark">
      <h3 className="th-chart-card__title">Result distribution</h3>
      <p className="th-chart-card__subtitle">Passed, failed, and pending breakdown</p>
      <div className="th-chart-card__canvas th-chart-card__canvas--donut">
        <Doughnut data={data} options={options} plugins={plugins} />
      </div>
    </div>
  );
}
