export default function CourseStepSubjects({ subjects, onSubjectChange, onAdd, onRemove, onMove }) {
  return (
    <div className="admin-course-wizard-step">
      <p className="admin-courses__muted">Curriculum units for this course. Reorder with the arrows. Titles must be unique.</p>
      {subjects.map((s, idx) => (
        <div key={idx} className="admin-card" style={{ marginTop: '1rem', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
            <strong>Subject {idx + 1}</strong>
            <span style={{ display: 'flex', gap: '0.25rem' }}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onMove(idx, -1)} disabled={idx === 0}>
                Up
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => onMove(idx, 1)}
                disabled={idx === subjects.length - 1}
              >
                Down
              </button>
            </span>
          </div>
          <div className="admin-field" style={{ marginTop: '0.75rem' }}>
            <label>Title</label>
            <input value={s.title} onChange={(e) => onSubjectChange(idx, { title: e.target.value })} />
          </div>
          <div className="admin-field">
            <label>Context / summary (optional)</label>
            <textarea
              rows={3}
              value={s.description ?? ''}
              onChange={(e) => onSubjectChange(idx, { description: e.target.value || null })}
            />
          </div>
          {subjects.length > 1 ? (
            <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: '0.5rem' }} onClick={() => onRemove(idx)}>
              Remove
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="btn btn--secondary btn--sm" style={{ marginTop: '1rem' }} onClick={onAdd}>
        Add subject
      </button>
    </div>
  );
}
