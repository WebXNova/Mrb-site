import { useEffect, useMemo, useState } from 'react';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminCourseNotesPanel from '../components/courses/AdminCourseNotesPanel';
import { useAdminToast } from '../context/AdminToastContext';
import '../styles/admin-notes-page.css';

export default function AdminNotesPage() {
  const token = getAdminToken();
  const toast = useAdminToast();

  const [coursesLoading, setCoursesLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setCoursesLoading(true);
    adminApi
      .courses(token)
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setCourses(list);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.message || 'Failed to load courses.');
        setCourses([]);
      })
      .finally(() => {
        if (!cancelled) setCoursesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const courseOptions = useMemo(
    () =>
      courses.map((course) => ({
        id: course.id,
        title: course.title || course.name || `Course ${course.id}`,
      })),
    [courses]
  );

  const selectedCourse = useMemo(
    () => courseOptions.find((course) => String(course.id) === String(selectedCourseId)) ?? null,
    [courseOptions, selectedCourseId]
  );

  const parsedCourseId = Number(selectedCourseId);
  const hasValidCourse =
    Number.isInteger(parsedCourseId) && parsedCourseId > 0 && Boolean(selectedCourse);

  return (
    <section className="admin-page admin-page--notes">
      <header className="admin-notes-page__hero">
        <div>
          <h2 className="heading-3 admin-notes-page__title">Notes</h2>
          <p className="admin-notes-page__subtitle">
            Upload and manage study materials scoped to a course — optionally narrowed to subjects,
            chapters, or lectures.
          </p>
        </div>
      </header>

      <div className="admin-reg-stat-grid admin-notes-page__stats">
        <article className="admin-reg-stat admin-reg-stat--muted">
          <span className="admin-reg-stat__value">{coursesLoading ? '—' : courseOptions.length}</span>
          <span className="admin-reg-stat__label">Courses</span>
        </article>
        <article
          className={`admin-reg-stat${
            hasValidCourse ? ' admin-reg-stat--active admin-reg-stat--primary' : ' admin-reg-stat--muted'
          }`}
        >
          <span className="admin-reg-stat__value admin-notes-page__stat-course">
            {selectedCourse?.title ?? 'None'}
          </span>
          <span className="admin-reg-stat__label">Selected course</span>
        </article>
      </div>

      {!hasValidCourse ? (
        <section className="admin-notes-page__picker" aria-labelledby="admin-notes-picker-title">
          <div className="admin-notes-page__picker-badge" aria-hidden>
            1
          </div>
          <div className="admin-notes-page__picker-body">
            <div className="admin-notes-page__picker-copy">
              <MenuBookOutlinedIcon className="admin-notes-page__picker-icon" aria-hidden />
              <div>
                <h3 id="admin-notes-picker-title" className="admin-notes-page__picker-title">
                  Choose a course to get started
                </h3>
                <p className="admin-notes-page__picker-lead">
                  Notes belong to one course at a time. Select a course below to review existing
                  materials or upload new files.
                </p>
              </div>
            </div>

            <label className="admin-notes-page__picker-field" htmlFor="admin-notes-course">
              <span className="admin-notes-page__picker-label">Course</span>
              <select
                id="admin-notes-course"
                className="course-edit-select admin-notes-page__course-select"
                value={selectedCourseId}
                disabled={coursesLoading}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                <option value="">
                  {coursesLoading ? 'Loading courses…' : 'Select a course…'}
                </option>
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : (
        <div className="admin-notes-page__workspace">
          <div className="admin-notes-page__context">
            <div className="admin-notes-page__context-main">
              <span className="admin-notes-page__context-kicker">Managing notes for</span>
              <strong className="admin-notes-page__context-title">{selectedCourse.title}</strong>
            </div>
            <label className="admin-notes-page__context-switch" htmlFor="admin-notes-course-switch">
              <span className="admin-notes-page__context-switch-label">Change course</span>
              <select
                id="admin-notes-course-switch"
                className="course-edit-select admin-notes-page__course-select"
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
              >
                {courseOptions.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <AdminCourseNotesPanel
            key={parsedCourseId}
            token={token}
            courseId={parsedCourseId}
            variant="standalone"
          />
        </div>
      )}
    </section>
  );
}
