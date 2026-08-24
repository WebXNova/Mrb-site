import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import {
  createCenterTextPlugin,
  ensureHistoryChartsRegistered,
} from '../../features/test-history/utils/chartSetup';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

ensureHistoryChartsRegistered();

function AnalyticsMetric({ label, value, suffix = '' }) {
  return (
    <div className="tests-analytics__metric">
      <span className="tests-analytics__metric-label">{label}</span>
      <span className="tests-analytics__metric-value">
        {value}
        {suffix}
      </span>
    </div>
  );
}

export default function AdminTestResultsAnalyticsPanel({ tests = [], testId = null }) {
  const token = getAdminToken();
  const publishedTests = useMemo(() => {
    if (testId != null && String(testId).trim() !== '') {
      return [{ id: Number(testId) }];
    }
    return tests.filter((test) => isTestPublishedStatus(test.status));
  }, [tests, testId]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (testId != null && String(testId).trim() !== '') {
      setSelectedTestId(String(testId));
      return;
    }
    if (selectedTestId) return;
    const first = publishedTests[0];
    if (first?.id) setSelectedTestId(String(first.id));
  }, [publishedTests, selectedTestId, testId]);

  const loadAnalytics = useCallback(async () => {
    if (!selectedTestId) {
      setAnalytics(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await adminApi.getTestResultsAnalytics(token, selectedTestId);
      setAnalytics(response?.data ?? null);
    } catch (err) {
      setAnalytics(null);
      setError(err.message || 'Failed to load test analytics.');
    } finally {
      setLoading(false);
    }
  }, [selectedTestId, token]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const barData = useMemo(() => {
    if (!analytics) return null;
    return {
      labels: ['Passed', 'Failed', 'Pending'],
      datasets: [
        {
          label: 'Attempts',
          data: [analytics.passed ?? 0, analytics.failed ?? 0, analytics.pending ?? 0],
          backgroundColor: ['#10B981', '#EF4444', '#F59E0B'],
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    };
  }, [analytics]);

  const passRate = analytics?.passRate ?? null;
  const totalAttempts = Number(analytics?.totalAttempts ?? 0);

  const doughnutChartData = useMemo(() => {
    if (!analytics) return null;
    const passed = Number(analytics.passed ?? 0);
    const failed = Number(analytics.failed ?? 0);
    const pending = Number(analytics.pending ?? 0);
    const slices = [
      { label: 'Passed', value: passed, color: '#10B981' },
      { label: 'Failed', value: failed, color: '#EF4444' },
    ];
    if (pending > 0) {
      slices.push({ label: 'Pending', value: pending, color: '#F59E0B' });
    }
    return {
      labels: slices.map((slice) => slice.label),
      datasets: [
        {
          data: slices.map((slice) => slice.value),
          backgroundColor: slices.map((slice) => slice.color),
          borderColor: '#fff',
          borderWidth: 2,
        },
      ],
    };
  }, [analytics]);

  const hasDoughnutData = Boolean(
    doughnutChartData?.datasets?.[0]?.data?.some((value) => Number(value) > 0)
  );

  const centerSublabel = `${totalAttempts} total attempt${totalAttempts === 1 ? '' : 's'}`;

  const doughnutPlugins = useMemo(
    () => [
      createCenterTextPlugin({
        title: passRate == null ? 'No graded attempts' : 'Overall Pass Rate',
        value: passRate == null ? '' : `${passRate}%`,
        sublabel: centerSublabel,
      }),
    ],
    [passRate, centerSublabel]
  );

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#E2E8F0',
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748B', font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#64748B', precision: 0, font: { size: 11 } },
          grid: { color: 'rgba(148, 163, 184, 0.15)' },
        },
      },
    }),
    []
  );

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: '#64748B',
            boxWidth: 10,
            boxHeight: 10,
            padding: 10,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#FFFFFF',
          bodyColor: '#E2E8F0',
        },
      },
    }),
    []
  );

  if (publishedTests.length === 0) {
    return (
      <section className="tests-analytics">
        <header className="tests-analytics__header">
          <h2 className="tests-analytics__title">Test results analytics</h2>
        </header>
        <p className="tests-analytics__empty">Publish a test to view attempt statistics and charts.</p>
      </section>
    );
  }

  return (
    <section className="tests-analytics" aria-busy={loading}>
      <header className="tests-analytics__header">
        <h2 className="tests-analytics__title">Test results analytics</h2>
        <div className="tests-analytics__select">
          <label htmlFor="adminTestAnalyticsSelect">Select test</label>
          <select
            id="adminTestAnalyticsSelect"
            value={selectedTestId}
            onChange={(event) => setSelectedTestId(event.target.value)}
            disabled={Boolean(testId)}
          >
            {publishedTests.map((test) => (
              <option key={test.id} value={String(test.id)}>
                {test.title || `Test #${test.id}`}
              </option>
            ))}
          </select>
        </div>
      </header>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading && !analytics ? (
        <p className="tests-analytics__empty">Loading analytics…</p>
      ) : analytics ? (
        <>
          <div className="tests-analytics__metrics">
            <AnalyticsMetric label="Total attempts" value={analytics.totalAttempts ?? 0} />
            <AnalyticsMetric label="Passed" value={analytics.passed ?? 0} />
            <AnalyticsMetric label="Failed" value={analytics.failed ?? 0} />
            <AnalyticsMetric label="Pending" value={analytics.pending ?? 0} />
            <AnalyticsMetric
              label="Average score"
              value={analytics.averagePercentage == null ? '—' : analytics.averagePercentage}
              suffix={analytics.averagePercentage == null ? '' : '%'}
            />
            <AnalyticsMetric
              label="Pass rate"
              value={analytics.passRate == null ? '—' : analytics.passRate}
              suffix={analytics.passRate == null ? '' : '%'}
            />
          </div>

          <div className="tests-analytics__charts">
            <div className="tests-analytics__chart">
              <h3 className="tests-analytics__chart-title">Pass / fail / pending breakdown</h3>
              <div className="tests-analytics__canvas">
                {barData ? <Bar data={barData} options={chartOptions} /> : null}
              </div>
            </div>
            <div className="tests-analytics__chart">
              <h3 className="tests-analytics__chart-title">Result distribution</h3>
              <div className="tests-analytics__canvas">
                {hasDoughnutData && doughnutChartData ? (
                  <Doughnut data={doughnutChartData} options={doughnutOptions} plugins={doughnutPlugins} />
                ) : (
                  <p className="tests-analytics__empty">No graded attempts to chart yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
