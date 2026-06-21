/** @param {Record<string, unknown>|null|undefined} payload */
export function normalizeHistoryPayload(payload) {
  const data = payload?.data ?? payload;
  if (!data || typeof data !== 'object') return null;

  const items = Array.isArray(data.items)
    ? data.items.map(normalizeHistoryItem).filter(Boolean)
    : [];

  return {
    items,
    pagination: {
      page: Number(data.pagination?.page ?? 1),
      pageSize: Number(data.pagination?.pageSize ?? 10),
      totalItems: Number(data.pagination?.totalItems ?? 0),
      totalPages: Number(data.pagination?.totalPages ?? 0),
    },
    filterOptions: {
      subjects: Array.isArray(data.filterOptions?.subjects)
        ? data.filterOptions.subjects
            .map((subject) => ({
              id: Number(subject.id),
              title: String(subject.title ?? ''),
            }))
            .filter((subject) => Number.isFinite(subject.id) && subject.title)
        : [],
    },
    statistics: {
      totalTests: Number(data.statistics?.totalTests ?? 0),
      passedTests: Number(data.statistics?.passedTests ?? 0),
      failedTests: Number(data.statistics?.failedTests ?? 0),
      averagePercentage:
        data.statistics?.averagePercentage == null
          ? null
          : Number(data.statistics.averagePercentage),
    },
  };
}

/** @param {Record<string, unknown>|null|undefined} item */
function normalizeHistoryItem(item) {
  if (!item || typeof item !== 'object') return null;

  return {
    attemptId: Number(item.attemptId),
    testId: Number(item.testId),
    testTitle: String(item.testTitle ?? ''),
    subjectLabel: item.subjectLabel == null ? null : String(item.subjectLabel),
    slug: item.slug ?? null,
    submittedAt: item.submittedAt ?? null,
    resultAvailable: Boolean(item.resultAvailable),
    score: item.score ?? null,
    maxScore: item.maxScore ?? null,
    percentage: item.percentage ?? null,
    status: item.status == null ? null : String(item.status),
  };
}

/** @param {unknown} err */
export function getHistoryErrorMessage(err, fallback = 'Could not load results.') {
  const status = err?.status;
  const message = String(err?.message || '');

  if (status === 401) return 'Please sign in to view your results.';
  if (status === 403) return 'You do not have access to results for this course.';
  if (status === 404) return 'Results are not available.';
  return message || fallback;
}
