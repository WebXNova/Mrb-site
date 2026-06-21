export default function CourseWizardLayout({ children, footer }) {
  return (
    <div className="admin-course-wizard">
      <div className="admin-course-wizard__main">{children}</div>
      {footer ? <div className="admin-course-wizard__nav-actions">{footer}</div> : null}
    </div>
  );
}
