import TestStatusBadge, { formatTestStatusLabel } from './TestStatusBadge';
import { TestWizardProgress } from './TestWizardProgress';
import TestPublishActions from './TestPublishActions';
import TestResultsReleasePanel from './TestResultsReleasePanel';
import TestWizardMissingHint from './TestWizardMissingHint';
import { isStandaloneAccessType } from '../constants/testAccessType.js';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation.js';
import {
  formatAdminDateTime,
  formatCourseLabel,
  formatPkrAmount,
  formatSeatInventoryLine,
  formatTestAccessTypeLabel,
  getAccessModeOptionCopy,
} from '../utils/testAdminDisplay.js';

function DetailRow({ label, value }) {
  return (
    <div className="admin-test-detail-row">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="admin-test-detail-section">
      <h2 className="heading-4">{title}</h2>
      <dl className="admin-test-detail-grid">{children}</dl>
    </section>
  );
}

function formatBool(value) {
  return value ? 'Yes' : 'No';
}

function formatDate(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

/**
 * Read-only summary of all test wizard data.
 */
export default function TestDetailsView({
  testId,
  test,
  rules,
  settings,
  completeness,
  courseTitle,
  questionCount,
  onPublished,
  publishSummary = null,
  summaryLoading = false,
  readOnly = false,
  onResultsReleasedChange,
}) {
  const subjectIds = Array.isArray(test?.subjectIds) ? test.subjectIds.join(', ') : '—';
  const canPublish = Boolean(completeness?.can_publish) && !readOnly;
  const showReleasePanel = Boolean(testId) && isTestPublishedStatus(test?.status);
  const showPublishPanel = !readOnly && Boolean(completeness);
  const accessType = test?.testAccessType || settings?.test_access_type || 'course_locked';
  const standalone = isStandaloneAccessType(accessType);
  const accessCopy = getAccessModeOptionCopy(accessType, settings?.access_mode);

  return (
    <div className="admin-test-details">
      <TestWizardProgress
        completeness={completeness}
        showMissingDetails
        readOnly={readOnly}
        testId={testId}
        activeStep="publish"
      />

      {showReleasePanel ? (
        <TestResultsReleasePanel
          testId={testId}
          resultsReleasedAt={settings?.results_released_at ?? null}
          onChanged={onResultsReleasedChange}
        />
      ) : null}

      {showPublishPanel && canPublish ? (
        <TestPublishActions
          testId={testId}
          completeness={completeness}
          summaryLoading={summaryLoading}
          onPublished={onPublished}
        />
      ) : null}

      {showPublishPanel && !canPublish ? (
        <div className="admin-publish-callout admin-publish-callout--blocked">
          <p className="admin-publish-callout__text">
            <strong>Cannot publish yet.</strong> Fix everything below, then try again.
          </p>
          <TestWizardMissingHint
            completeness={completeness}
            missingFields={completeness?.missing_fields || []}
            activeStep="publish"
            testId={testId}
            variant="list"
          />
        </div>
      ) : null}

      <DetailSection title="Overview">
        <DetailRow label="Test ID" value={test?.id} />
        <DetailRow label="Status" value={<TestStatusBadge status={test?.status} />} />
        <DetailRow label="Lifecycle" value={formatTestStatusLabel(completeness?.lifecycle_status)} />
        <DetailRow label="Type" value={formatTestAccessTypeLabel(accessType)} />
        <DetailRow label="Course" value={standalone ? '—' : courseTitle || formatCourseLabel(test)} />
        <DetailRow label="Category" value={test?.category} />
        <DetailRow label="Subject mix" value={test?.testType} />
        <DetailRow label="Subjects" value={test?.subjectLabel || subjectIds} />
        <DetailRow label="Questions" value={questionCount} />
        <DetailRow label="Description" value={test?.description || '—'} />
        <DetailRow label="Public link" value={test?.publicLink || '—'} />
        <DetailRow label="Created" value={formatDate(test?.createdAt)} />
        <DetailRow label="Updated" value={formatDate(test?.updatedAt)} />
      </DetailSection>

      <DetailSection title="Rules & scoring">
        <DetailRow label="Duration" value={rules?.duration_minutes != null ? `${rules.duration_minutes} min` : '—'} />
        <DetailRow label="Max attempts" value={rules?.max_attempts} />
        <DetailRow label="Passing marks" value={rules?.passing_marks} />
        <DetailRow label="Total marks" value={publishSummary?.total_marks ?? '—'} />
        <DetailRow label="Negative marking" value={rules?.negative_marking} />
      </DetailSection>

      <DetailSection title="Settings & access">
        <DetailRow label="Access mode" value={accessCopy.label} />
        <DetailRow label="Student access" value={accessCopy.hint} />
        {standalone ? (
          <>
            {accessType === 'paid_standalone' ? (
              <DetailRow label="Price" value={formatPkrAmount(settings?.price_pkr ?? test?.pricePkr)} />
            ) : null}
            <DetailRow
              label="Seats"
              value={formatSeatInventoryLine({
                testAccessType: accessType,
                seatCapacity: settings?.seat_capacity ?? test?.seatCapacity,
                confirmedSeats: settings?.confirmed_seats ?? test?.confirmedSeats,
              })}
            />
            <DetailRow label="Starts" value={formatAdminDateTime(settings?.start_date ?? test?.startDate)} />
            <DetailRow label="Ends" value={formatAdminDateTime(settings?.end_date ?? test?.endDate)} />
          </>
        ) : null}
        <DetailRow label="Shuffle questions" value={formatBool(settings?.shuffle_questions)} />
        <DetailRow label="Shuffle options" value={formatBool(settings?.shuffle_options)} />
        <DetailRow label="Show explanations" value={formatBool(settings?.show_explanations)} />
        <DetailRow label="Show result immediately" value={formatBool(settings?.show_result_immediately)} />
        <DetailRow
          label="Results released"
          value={
            settings?.results_released_at
              ? formatDate(settings.results_released_at)
              : 'Not published'
          }
        />
      </DetailSection>
    </div>
  );
}
