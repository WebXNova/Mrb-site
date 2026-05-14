const STEP_LABELS = ['Course details', 'Pricing', 'Batches', 'Subjects', 'Review'];

export default function CourseWizardLayout({ stepIndex, children, preview }) {
  return (
    <div className="admin-course-wizard">
      <nav className="admin-course-wizard__nav" aria-label="Course wizard steps">
        <ol className="admin-course-wizard__nav-list">
          {STEP_LABELS.map((label, i) => (
            <li
              key={label}
              className={`admin-course-wizard__nav-item${i === stepIndex ? ' admin-course-wizard__nav-item--active' : ''}${
                i < stepIndex ? ' admin-course-wizard__nav-item--done' : ''
              }`}
            >
              <span className="admin-course-wizard__nav-index">{i + 1}</span>
              <span className="admin-course-wizard__nav-label">{label}</span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="admin-course-wizard__body">
        <div className="admin-course-wizard__main">{children}</div>
        {preview ? <aside className="admin-course-wizard__aside">{preview}</aside> : null}
      </div>
    </div>
  );
}
