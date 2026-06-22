import { useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';
import { buildScoreChartData } from '../utils/buildChartData';
import { createBarGradient, ensureHistoryChartsRegistered } from '../utils/chartSetup';
import { useStudentTheme } from '../../../student/context/StudentThemeContext';

ensureHistoryChartsRegistered();

/**
 * Column chart — score percentage per test title.
 * @param {{ items: Array<Record<string, unknown>>, averagePercentage?: number|null }} props
 */
export default function HistoryScoreChart({ items, averagePercentage = null }) {
  const { isDark } = useStudentTheme();
  const chartRef = useRef(null);
  const chartData = useMemo(
    () => buildScoreChartData(items, averagePercentage),
    [items, averagePercentage]
  );

  const data = useMemo(() => {
    const datasets = [
      {
        label: 'Score',
        data: chartData.scores,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 42,
        backgroundColor(context) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return isDark ? '#22b8cf' : '#6366F1';
          return createBarGradient(ctx, isDark ? '#22b8cf' : '#6366F1', isDark ? '#3bc9db' : '#A855F7');
        },
      },
    ];

    if (chartData.hasAverage) {
      datasets.push({
        label: 'Average',
        data: chartData.averages,
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 42,
        backgroundColor(context) {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return isDark ? '#8ba3c7' : '#14B8A6';
          return createBarGradient(ctx, isDark ? '#8ba3c7' : '#14B8A6', isDark ? '#a5b4fc' : '#06B6D4');
        },
      });
    }

    return {
      labels: chartData.labels,
      datasets,
    };
  }, [chartData, isDark]);

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      animation: {
        duration: 1000,
        easing: 'easeOutQuart',
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: isDark ? '#8ba3c7' : '#CBD5E1',
            boxWidth: 12,
            boxHeight: 12,
            usePointStyle: true,
          },
        },
        tooltip: {
          backgroundColor: isDark ? '#122b44' : 'rgba(15, 23, 42, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: isDark ? '#e8edf3' : '#E2E8F0',
          borderColor: isDark ? '#1e405b' : 'rgba(59, 130, 246, 0.45)',
          borderWidth: 1,
          padding: 12,
          callbacks: {
            title(tooltipItems) {
              const index = tooltipItems[0]?.dataIndex ?? 0;
              return chartData.rawItems[index]?.testTitle ?? tooltipItems[0]?.label ?? '';
            },
            label(context) {
              const index = context.dataIndex;
              const item = chartData.rawItems[index];
              const lines = [`${context.dataset.label}: ${context.formattedValue}%`];
              if (item?.score != null && item?.maxScore != null) {
                lines.push(`Marks: ${item.score} / ${item.maxScore}`);
              }
              return lines;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: isDark ? '#8ba3c7' : '#94A3B8',
            maxRotation: 45,
            minRotation: 0,
          },
          grid: { color: isDark ? 'rgba(30, 64, 91, 0.3)' : 'rgba(148, 163, 184, 0.12)' },
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: isDark ? '#8ba3c7' : '#94A3B8',
            callback: (value) => `${value}%`,
          },
          grid: { color: isDark ? 'rgba(30, 64, 91, 0.3)' : 'rgba(148, 163, 184, 0.12)' },
        },
      },
    }),
    [chartData.rawItems, isDark]
  );

  if (!chartData.labels.length) {
    return (
      <div className="th-chart-card th-chart-card--dark">
        <h3 className="th-chart-card__title">Score by test</h3>
        <p className="th-chart-card__empty">No graded results to chart yet.</p>
      </div>
    );
  }

  return (
    <div className="th-chart-card th-chart-card--dark">
      <h3 className="th-chart-card__title">Score by test</h3>
      <p className="th-chart-card__subtitle">Percentage obtained per test title</p>
      <div className="th-chart-card__canvas">
        <Bar ref={chartRef} data={data} options={options} />
      </div>
    </div>
  );
}
