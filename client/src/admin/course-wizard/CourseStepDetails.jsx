const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];

export default function CourseStepDetails({
  course,
  onChange,
  shortDescriptionLen,
  descriptionLen,
  titleLen,
  fieldErrors,
  imageUploading,
  imageInputRef,
  onImageChange,
  onClearImage,
}) {
  return (
    <div className="admin-course-wizard-step">
      <div className="admin-form-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="admin-field">
          <label htmlFor="wiz_title">Title</label>
          <input
            id="wiz_title"
            name="title"
            value={course.title}
            onChange={onChange}
            autoComplete="off"
            aria-invalid={Boolean(fieldErrors.title)}
          />
          <div className="admin-courses__muted" style={{ marginTop: '0.25rem', fontSize: 'var(--fs-12)' }}>
            {titleLen} / 180 (min 3)
          </div>
          {fieldErrors.title ? (
            <div className="admin-field__error" role="alert">
              {fieldErrors.title}
            </div>
          ) : null}
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_level">Level</label>
          <select id="wiz_level" name="level" value={course.level} onChange={onChange}>
            {LEVEL_OPTIONS.map((lvl) => (
              <option key={lvl} value={lvl}>
                {lvl}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-field">
          <label className="admin-field__inline">
            <input type="checkbox" name="is_active" checked={!!course.is_active} onChange={onChange} /> Active in catalog
            when published
          </label>
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_short">Short description</label>
          <textarea
            id="wiz_short"
            name="short_description"
            value={course.short_description ?? ''}
            onChange={onChange}
            rows={2}
            maxLength={512}
            placeholder="Optional listing summary"
          />
          <div className="admin-courses__muted" style={{ marginTop: '0.25rem', fontSize: 'var(--fs-12)' }}>
            {shortDescriptionLen} / 512
          </div>
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_desc">Full description</label>
          <textarea
            id="wiz_desc"
            name="description"
            value={course.description}
            onChange={onChange}
            rows={8}
            aria-invalid={Boolean(fieldErrors.description)}
          />
          <div className="admin-courses__muted" style={{ marginTop: '0.25rem', fontSize: 'var(--fs-12)' }}>
            {descriptionLen} characters (min 30)
          </div>
          {fieldErrors.description ? (
            <div className="admin-field__error" role="alert">
              {fieldErrors.description}
            </div>
          ) : null}
        </div>
        <div className="admin-field">
          <label htmlFor="wiz_thumb">Thumbnail</label>
          <input
            id="wiz_thumb"
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onImageChange}
            disabled={imageUploading}
          />
          <small className="admin-courses__muted">
            {imageUploading ? 'Uploading…' : 'JPEG, PNG, or WebP. Max 5 MB.'}
          </small>
          {course.thumbnail_url ? (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <img
                src={course.thumbnail_url}
                alt="Course thumbnail preview"
                style={{ maxWidth: '220px', borderRadius: '8px', border: '1px solid var(--color-border, #e5e7eb)' }}
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={onClearImage}>
                Remove image
              </button>
            </div>
          ) : (
            <p className="admin-courses__muted" style={{ marginTop: '0.5rem' }}>
              Preview appears here after upload (required before publish).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
