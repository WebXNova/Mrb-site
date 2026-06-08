import TestStatusBadge, { formatTestStatusLabel } from './TestStatusBadge';
import { TestWizardProgress } from './TestWizardProgress';

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
export default function TestDetailsView({ test, rules, settings, completeness, courseTitle, questionCount }) {
  const subjectIds = Array.isArray(test?.subjectIds) ? test.subjectIds.join(', ') : '—';

  return (
    <div className="admin-test-details">
      <TestWizardProgress completeness={completeness} showMissingDetails />

      <DetailSection title="Overview">
        <DetailRow label="Test ID" value={test?.id} />
        <DetailRow label="Status" value={<TestStatusBadge status={test?.status} />} />
        <DetailRow label="Lifecycle" value={formatTestStatusLabel(completeness?.lifecycle_status)} />
        <DetailRow label="Course" value={courseTitle} />
        <DetailRow label="Category" value={test?.category} />
        <DetailRow label="Test type" value={test?.testType} />
        <DetailRow label="Subjects" value={test?.subjectLabel || subjectIds} />
        <DetailRow label="Linked questions" value={questionCount} />
        <DetailRow label="Description" value={test?.description || '—'} />
        <DetailRow label="Public link" value={test?.publicLink || '—'} />
        <DetailRow label="Created" value={formatDate(test?.createdAt)} />
        <DetailRow label="Updated" value={formatDate(test?.updatedAt)} />
      </DetailSection>

      <DetailSection title="Rules & scoring">
        <DetailRow label="Duration" value={rules?.duration_minutes != null ? `${rules.duration_minutes} min` : '—'} />
        <DetailRow label="Max attempts" value={rules?.max_attempts} />
        <DetailRow label="Passing %" value={rules?.passing_percentage} />
        <DetailRow label="Passing marks" value={rules?.passing_marks} />
        <DetailRow label="Negative marking" value={rules?.negative_marking} />
      </DetailSection>

      <DetailSection title="Settings & access">
        <DetailRow label="Access mode" value={settings?.access_mode} />
        <DetailRow label="Shuffle questions" value={formatBool(settings?.shuffle_questions)} />
        <DetailRow label="Shuffle options" value={formatBool(settings?.shuffle_options)} />
        <DetailRow label="Show explanations" value={formatBool(settings?.show_explanations)} />
        <DetailRow label="Show result immediately" value={formatBool(settings?.show_result_immediately)} />
        <DetailRow label="Show answers after submit" value={formatBool(settings?.show_answers_after_submit)} />
        <DetailRow label="Allow retake" value={formatBool(settings?.allow_retake)} />
        <DetailRow label="Start date" value={formatDate(settings?.start_date)} />
        <DetailRow label="End date" value={formatDate(settings?.end_date)} />
      </DetailSection>
    </div>
  );
}
