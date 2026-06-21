import { adminRoute } from '../../config/adminPaths';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminToken } from '../../auth/session';
import AdminCourseSubjectsPanel from './AdminCourseSubjectsPanel';

export default function AdminCourseSubjectsPage() {
  const token = getAdminToken();
  const { courseId: rawCourseId } = useParams();
  const courseId = Number(rawCourseId);
  const courseIdValid = Number.isFinite(courseId) && courseId > 0;

  const title = useMemo(() => (courseIdValid ? `Course #${courseId}` : 'Subjects'), [courseId, courseIdValid]);

  if (!courseIdValid) {
    return (
      <section className="admin-page">
        <section className="admin-card">
          <h2 className="heading-3">Invalid course</h2>
          <p className="admin-error">Course id in the URL is not valid.</p>
          <div className="admin-actions">
            <Link to={adminRoute('courses')} className="btn btn--secondary">
              Back to courses
            </Link>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="heading-3">{title}</h2>
          <Link to={adminRoute('courses')} className="btn btn--secondary btn--sm">
            Back to courses
          </Link>
        </div>
        <p className="admin-muted" style={{ marginTop: '0.5rem' }}>
          Prefer managing Subjects from the main courses screen; this page stays for direct links and bookmarks.
        </p>
      </section>
      <AdminCourseSubjectsPanel token={token} courseId={courseId} />
    </section>
  );
}
