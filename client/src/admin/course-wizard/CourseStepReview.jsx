export default function CourseStepReview({
  course,
  pricing,
  batches,
  subjects,
  warnings,
  saving,
  onSaveDraft,
  onOpenPublishModal,
  onCancel,
}) {
  return (
    <div className="admin-course-wizard-step">
      <h4 className="heading-4">Course summary</h4>
      <ul className="admin-courses__muted">
        <li>
          <strong>Title:</strong> {course.title || '—'}
        </li>
        <li>
          <strong>Level:</strong> {course.level}
        </li>
        <li>
          <strong>Thumbnail:</strong> {course.thumbnail_url ? 'Attached' : 'Missing'}
        </li>
      </ul>
      <h4 className="heading-4">Pricing</h4>
      <p className="admin-courses__muted">
        {pricing.pricing_type} · {pricing.currency_code}{' '}
        {pricing.pricing_type === 'free' ? '0' : Number(pricing.price_amount || 0).toLocaleString('en-PK')}
      </p>
      <h4 className="heading-4">Batches</h4>
      <p className="admin-courses__muted">
        {batches.length} batch(es). Courses allow exactly one batch; edit this batch if you need changes.
      </p>
      <h4 className="heading-4">Subjects</h4>
      <p className="admin-courses__muted">{subjects.filter((s) => String(s.title || '').trim()).length} subject(s)</p>
      {warnings.length > 0 ? (
        <div className="admin-card" style={{ marginTop: '1rem', padding: '1rem', borderColor: 'var(--color-warning, #d97706)' }}>
          <strong>Before you publish</strong>
          <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button type="button" className="btn btn--secondary" disabled={saving} onClick={onSaveDraft}>
          Save as draft
        </button>
        <button type="button" className="btn btn--primary" disabled={saving} onClick={onOpenPublishModal}>
          Publish
        </button>
        <button type="button" className="btn btn--ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
