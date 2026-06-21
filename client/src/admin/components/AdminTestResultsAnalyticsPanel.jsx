import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import {
  createCenterTextPlugin,
  ensureHistoryChartsRegistered,
} from '../../features/test-history/utils/chartSetup';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';
import '../styles/admin-test-results-analytics.css';

ensureHistoryChartsRegistered();

function StatCard({ label, value, suffix = '' }) {
  return (
    <article className="admin-stat-card admin-test-analytics__stat">
      <p className="admin-stat-card__label">{label}</p>
      <p className="admin-stat-card__value">
        {value}
        {suffix}
      </p>
    </article>
  );
}

export default function AdminTestResultsAnalyticsPanel({ tests = [] }) {
  const token = getAdminToken();
  const publishedTests = useMemo(
    () => tests.filter((test) => isTestPublishedStatus(test.status)),
    [tests]
  );
  const [selectedTestId, setSelectedTestId] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedTestId) return;
    const first = publishedTests[0];
    if (first?.id) setSelectedTestId(String(first.id));
  }, [publishedTests, selectedTestId]);

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
          borderRadius: 8,
          maxBarThickness: 56,
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
          ticks: { color: '#64748B' },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#64748B', precision: 0 },
          grid: { color: 'rgba(148, 163, 184, 0.2)' },
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
            color: '#475569',
            boxWidth: 12,
            boxHeight: 12,
            padding: 12,
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
      <section className="admin-card admin-test-analytics">
        <h2 className="heading-3">Test results analytics</h2>
        <p className="admin-test-analytics__empty">Publish a test to view attempt statistics and charts.</p>
      </section>
    );
  }

  return (
    <section className="admin-card admin-test-analytics" aria-busy={loading}>
      <div className="admin-test-analytics__head">
        <div>
          <h2 className="heading-3">Test results analytics</h2>
          <p className="admin-test-analytics__lead">
            Live pass/fail/pending breakdown and average score for exported test results.
          </p>
        </div>
        <div className="admin-field admin-test-analytics__select">
          <label htmlFor="adminTestAnalyticsSelect">Select test</label>
          <select
            id="adminTestAnalyticsSelect"
            value={selectedTestId}
            onChange={(event) => setSelectedTestId(event.target.value)}
          >
            {publishedTests.map((test) => (
              <option key={test.id} value={String(test.id)}>
                {test.title || `Test #${test.id}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <p className="admin-error">{error}</p> : null}

      {loading && !analytics ? (
        <p className="admin-test-analytics__empty">Loading analytics…</p>
      ) : analytics ? (
        <>
          <div className="admin-grid admin-test-analytics__stats">
            <StatCard label="Total attempts" value={analytics.totalAttempts ?? 0} />
            <StatCard label="Passed" value={analytics.passed ?? 0} />
            <StatCard label="Failed" value={analytics.failed ?? 0} />
            <StatCard label="Pending" value={analytics.pending ?? 0} />
            <StatCard
              label="Average score"
              value={analytics.averagePercentage == null ? '—' : analytics.averagePercentage}
              suffix={analytics.averagePercentage == null ? '' : '%'}
            />
            <StatCard
              label="Pass rate"
              value={analytics.passRate == null ? '—' : analytics.passRate}
              suffix={analytics.passRate == null ? '' : '%'}
            />
          </div>

          <div className="admin-test-analytics__charts">
            <div className="admin-test-analytics__chart-card">
              <h3 className="heading-4">Pass / fail / pending breakdown</h3>
              <div className="admin-test-analytics__canvas admin-test-analytics__canvas--bar">
                {barData ? <Bar data={barData} options={chartOptions} /> : null}
              </div>
            </div>
            <div className="admin-test-analytics__chart-card">
              <h3 className="heading-4">Result distribution</h3>
              <div className="admin-test-analytics__canvas admin-test-analytics__canvas--donut">
                {hasDoughnutData && doughnutChartData ? (
                  <Doughnut data={doughnutChartData} options={doughnutOptions} plugins={doughnutPlugins} />
                ) : (
                  <p className="admin-test-analytics__empty">No graded attempts to chart yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
