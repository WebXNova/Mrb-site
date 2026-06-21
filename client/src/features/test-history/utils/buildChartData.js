/** @param {import('../utils/normalizeHistory.js').ReturnType<typeof import('../utils/normalizeHistory.js').normalizeHistoryItem>[]} items */
export function buildScoreChartData(items, averagePercentage = null) {
  const graded = (items ?? []).filter(
    (item) => item.resultAvailable && item.percentage != null
  );

  const labels = graded.map((item) => truncateLabel(item.testTitle, 28));
  const scores = graded.map((item) => Number(item.percentage) || 0);
  const hasAverage =
    averagePercentage != null && Number.isFinite(Number(averagePercentage));
  const averages = hasAverage
    ? graded.map(() => Number(averagePercentage))
    : [];

  return {
    labels,
    scores,
    averages,
    hasAverage,
    rawItems: graded,
  };
}

/** @param {{ totalTests?: number, passedTests?: number, failedTests?: number }} statistics @param {Array<{ resultAvailable?: boolean, status?: string|null }>} items */
export function buildDistributionChartData(statistics, items = []) {
  const passed = Number(statistics?.passedTests ?? 0);
  const failed = Number(statistics?.failedTests ?? 0);
  const total = Number(statistics?.totalTests ?? items.length ?? 0);
  const pendingFromItems = items.filter((item) => !item.resultAvailable).length;
  const pending = Math.max(total - passed - failed, pendingFromItems, 0);

  const slices = [
    { key: 'passed', label: 'Passed', value: passed, color: '#10B981' },
    { key: 'failed', label: 'Failed', value: failed, color: '#EF4444' },
  ];

  if (pending > 0) {
    slices.push({ key: 'pending', label: 'Pending', value: pending, color: '#F59E0B' });
  }

  const gradedTotal = passed + failed;
  const passRate =
    gradedTotal > 0 ? Math.round((passed / gradedTotal) * 100) : null;

  return { slices, passRate, total };
}

function truncateLabel(value, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text || 'Untitled test';
  return `${text.slice(0, maxLength - 1)}…`;
}
