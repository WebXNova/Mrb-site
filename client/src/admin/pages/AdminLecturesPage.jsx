import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

const initialForm = {
  courseId: '',
  title: '',
  youtubeUrl: '',
  topic: '',
  sortOrder: 0,
  isActive: true,
};

export default function AdminLecturesPage() {
  const token = getAdminToken();
  const [courses, setCourses] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

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
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = {
        ...form,
        courseId: Number(form.courseId),
        sortOrder: Number(form.sortOrder || 0),
      };
      if (editingId) {
        await adminApi.updateLecture(token, editingId, payload);
      } else {
        await adminApi.createLecture(token, payload);
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
    setForm({
      ...initialForm,
      ...lecture,
      courseId: String(lecture.courseId),
      sortOrder: lecture.sortOrder || 0,
      isActive: !!lecture.isActive,
    });
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">{editingId ? 'Edit Lecture' : 'Add Lecture'}</h2>
        <form className="admin-page" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="courseId">Course</label>
              <select id="courseId" name="courseId" value={form.courseId} onChange={onChange} required>
                <option value="">Select course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={form.title} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="youtubeUrl">YouTube URL</label>
              <input id="youtubeUrl" name="youtubeUrl" value={form.youtubeUrl} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="topic">Topic</label>
              <input id="topic" name="topic" value={form.topic} onChange={onChange} />
            </div>
          </div>

          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
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
        <h2 className="heading-3">Lectures</h2>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Course</th>
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
                  <td colSpan={5}>No lectures found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
