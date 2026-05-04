import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

const initialForm = {
  courseId: '',
  title: '',
  youtubeUrl: '',
  topic: '',
  sortOrder: 1,
  isActive: true,
};

function isValidYouTubeUrl(url) {
  if (!url) return false;
  const pattern =
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=[\w-]{11}(&.*)?|youtu\.be\/[\w-]{11}(\?.*)?)$/i;
  return pattern.test(url.trim());
}

export default function AdminLecturesPage() {
  const token = getAdminToken();
  const [courses, setCourses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [lectureCategory, setLectureCategory] = useState('MDCAT');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function normalizeCategory(value) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  async function loadData() {
    const [courseRes, lectureRes] = await Promise.all([adminApi.courses(token), adminApi.lectures(token)]);
    setCourses(courseRes?.data || []);
    setLectures(lectureRes?.data || []);
  }

  useEffect(() => {
    loadData().catch((err) => setError(err.message || 'Failed to load lectures'));
  }, []);

  function onChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(initialForm);
    setLectureCategory('MDCAT');
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!isValidYouTubeUrl(form.youtubeUrl)) {
      setError('Please enter a valid YouTube URL (youtube.com/watch?v=... or youtu.be/...).');
      return;
    }
    try {
      const payload = {
        ...form,
        courseId: form.courseId ? Number(form.courseId) : undefined,
        courseCategory: lectureCategory,
        sortOrder: Number(form.sortOrder || 1),
      };
      if (editingId) {
        await adminApi.updateLecture(token, editingId, payload);
        setSuccess('Lecture updated successfully.');
      } else {
        await adminApi.createLecture(token, payload);
        setSuccess('Lecture created successfully.');
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to save lecture');
    }
  }

  async function onDelete(lectureId) {
    if (!window.confirm('Delete this lecture?')) return;
    setError('');
    try {
      await adminApi.deleteLecture(token, lectureId);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete lecture');
    }
  }

  function onEdit(lecture) {
    setEditingId(lecture.id);
    setLectureCategory((lecture.courseSubject || 'MDCAT').trim() || 'MDCAT');
    setForm({
      ...initialForm,
      ...lecture,
      courseId: String(lecture.courseId),
      sortOrder: lecture.sortOrder || 0,
      isActive: !!lecture.isActive,
    });
  }

  const categoryOptions = Array.from(
    new Set([
      'MDCAT',
      ...courses.map((course) => (course.subject || '').trim()).filter(Boolean),
      ...lectures.map((lecture) => (lecture.courseSubject || '').trim()).filter(Boolean),
    ])
  );
  const normalizedLectureCategory = normalizeCategory(lectureCategory);
  const courseOptions = courses.filter((course) =>
    normalizeCategory(course.subject || course.category) === normalizedLectureCategory
  );

  useEffect(() => {
    if (!courses.length) {
      setForm((prev) => ({ ...prev, courseId: '' }));
      return;
    }
    const fallbackCourseId = courseOptions[0]?.id || courses[0]?.id || '';
    const selectedCourseStillValid = courses.some((course) => String(course.id) === String(form.courseId));
    if (selectedCourseStillValid) return;
    setForm((prev) => ({ ...prev, courseId: String(fallbackCourseId) }));
  }, [courses, courseOptions, form.courseId]);

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">{editingId ? 'Edit Lecture' : 'Add Lecture'}</h2>
        <form className="admin-page admin-lectures-form" onSubmit={onSubmit}>
          <div className="admin-form-grid admin-lectures-form__grid">
            <div className="admin-field admin-lectures-form__field">
              <label htmlFor="lectureCategory">Course Category</label>
              <input
                id="lectureCategory"
                name="lectureCategory"
                list="lecture-category-options"
                value={lectureCategory}
                onChange={(event) => setLectureCategory(event.target.value)}
                placeholder="Type or choose category (e.g. MDCAT)"
                required
              />
              <datalist id="lecture-category-options">
                {categoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
              {courseOptions.length ? (
                <small className="admin-muted admin-lectures-form__hint">
                  Lecture will be added to: {courseOptions[0]?.title}
                </small>
              ) : null}
            </div>
            <div className="admin-field admin-lectures-form__field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={form.title} onChange={onChange} required />
            </div>
            <div className="admin-field admin-lectures-form__field">
              <label htmlFor="youtubeUrl">YouTube URL</label>
              <input id="youtubeUrl" name="youtubeUrl" value={form.youtubeUrl} onChange={onChange} required />
            </div>
            <div className="admin-field admin-lectures-form__field">
              <label htmlFor="topic">Topic</label>
              <input id="topic" name="topic" value={form.topic} onChange={onChange} />
            </div>
            <div className="admin-field admin-lectures-form__field">
              <label htmlFor="sortOrder">Order</label>
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={1}
                value={form.sortOrder}
                onChange={onChange}
              />
            </div>
          </div>

          <label className="admin-field admin-lectures-form__toggle">
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}
          <div className="admin-actions">
            <button className="btn btn--primary" type="submit">
              {editingId ? 'Update Lecture' : 'Create Lecture'}
            </button>
            {editingId ? (
              <button className="btn btn--secondary" type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="admin-card">
        <div className="admin-row-actions admin-lectures-table__head">
          <h2 className="heading-3">Lectures</h2>
        </div>
        <div className="admin-table-wrap admin-lectures-table">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Course</th>
                <th>Category</th>
                <th>Order</th>
                <th>YouTube ID</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {lectures.length ? (
                lectures.map((lecture) => (
                  <tr key={lecture.id}>
                    <td>{lecture.title}</td>
                    <td>{lecture.courseTitle || lecture.courseId}</td>
                    <td>{lecture.courseSubject || 'MDCAT'}</td>
                    <td>{lecture.sortOrder || '-'}</td>
                    <td>{lecture.youtubeVideoId}</td>
                    <td>{lecture.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn--secondary btn--sm" onClick={() => onEdit(lecture)} type="button">
                          Edit
                        </button>
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={() => onDelete(lecture.id)}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>No lectures found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
