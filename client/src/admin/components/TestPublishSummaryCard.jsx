import {
  formatDifficultyMix,
  formatDurationMinutes,
  formatTotalMarks,
} from '../utils/testPublishSummaryUtils';

function SummaryStat({ label, value }) {
  return (
    <div className="admin-publish-summary__stat">
      <dt className="admin-publish-summary__label">{label}</dt>
      <dd className="admin-publish-summary__value">{value}</dd>
    </div>
  );
}

/**
 * Pre-publish summary shown on the Publish step.
 * @param {{ publish_summary?: {
 *   total_questions?: number,
 *   total_marks?: number,
 *   duration_minutes?: number,
 *   difficulty_mix?: { easy?: number, medium?: number, hard?: number, unset?: number },
 * }|null, isLoading?: boolean }} props
 */
export default function TestPublishSummaryCard({ publish_summary: summary, isLoading = false }) {
  if (isLoading) {
    return (
      <section className="admin-publish-summary" aria-label="Publish summary" aria-busy="true">
        <h2 className="admin-publish-summary__title">Before you publish</h2>
        <div className="admin-skeleton admin-skeleton-row" />
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="admin-publish-summary" aria-label="Publish summary">
        <h2 className="admin-publish-summary__title">Before you publish</h2>
        <dl className="admin-publish-summary__grid">
          <SummaryStat label="Total Questions" value={0} />
          <SummaryStat label="Total Marks" value={formatTotalMarks(0)} />
          <SummaryStat label="Duration" value="—" />
          <SummaryStat label="Difficulty Mix" value="Not specified" />
        </dl>
      </section>
    );
  }

  return (
    <section className="admin-publish-summary" aria-label="Publish summary">
      <h2 className="admin-publish-summary__title">Before you publish</h2>
      <dl className="admin-publish-summary__grid">
        <SummaryStat label="Total Questions" value={summary.total_questions ?? 0} />
        <SummaryStat label="Total Marks" value={formatTotalMarks(summary.total_marks)} />
        <SummaryStat label="Passing Marks" value={formatTotalMarks(summary.passing_marks)} />
        <SummaryStat label="Duration" value={formatDurationMinutes(summary.duration_minutes)} />
        <SummaryStat label="Difficulty Mix" value={formatDifficultyMix(summary.difficulty_mix)} />
      </dl>
    </section>
  );
}
