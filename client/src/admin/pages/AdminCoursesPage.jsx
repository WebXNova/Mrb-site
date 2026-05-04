import { useEffect, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

const initialForm = {
  title: '',
  subject: '',
  description: '',
  price: 0,
  originalPrice: '',
  instructor: '',
  level: '',
  lecturesCount: '0',
  testsCount: '0',
  durationWeeks: 0,
  isActive: true,
};

export default function AdminCoursesPage() {
  const token = getAdminToken();
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadCourses() {
    const response = await adminApi.courses(token);
    setCourses(response?.data || []);
  }

  useEffect(() => {
    loadCourses().catch((err) => setError(err.message || 'Failed to load courses'));
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
    setSuccess('');
    try {
      const payload = {
        ...form,
        price: Number(form.price || 0),
        originalPrice: form.originalPrice === '' ? null : Number(form.originalPrice),
        durationWeeks: Number(form.durationWeeks || 0),
      };
      if (editingId) {
        await adminApi.updateCourse(token, editingId, payload);
        setSuccess('Course updated');
      } else {
        await adminApi.createCourse(token, payload);
        setSuccess('Course created');
      }
      resetForm();
      await loadCourses();
    } catch (err) {
      setError(err.message || 'Failed to save course');
    }
  }

  async function onDelete(courseId) {
    if (!window.confirm('Delete this course?')) return;
    setError('');
    try {
      await adminApi.deleteCourse(token, courseId);
      await loadCourses();
    } catch (err) {
      setError(err.message || 'Failed to delete course');
    }
  }

  function onEdit(course) {
    setEditingId(course.id);
    setForm({
      ...initialForm,
      ...course,
      originalPrice: course.originalPrice ?? '',
      isActive: !!course.isActive,
    });
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">{editingId ? 'Edit Course' : 'Create Course'}</h2>
        <form className="admin-page" onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="title">Title</label>
              <input id="title" name="title" value={form.title} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="subject">Subject</label>
              <input id="subject" name="subject" value={form.subject} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="price">Price</label>
              <input id="price" name="price" type="number" value={form.price} onChange={onChange} required />
            </div>
            <div className="admin-field">
              <label htmlFor="originalPrice">Original Price</label>
              <input
                id="originalPrice"
                name="originalPrice"
                type="number"
                value={form.originalPrice}
                onChange={onChange}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="instructor">Instructor</label>
              <input id="instructor" name="instructor" value={form.instructor} onChange={onChange} />
            </div>
            <div className="admin-field">
              <label htmlFor="level">Level</label>
              <input id="level" name="level" value={form.level} onChange={onChange} />
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" value={form.description} onChange={onChange} required />
          </div>

          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit">
              {editingId ? 'Update Course' : 'Create Course'}
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
        <h2 className="heading-3">Courses</h2>
        <div className="admin-table-wrap" style={{ marginTop: '1rem' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.length ? (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td>{course.title}</td>
                    <td>{course.subject}</td>
                    <td>{course.price}</td>
                    <td>{course.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn--secondary btn--sm" onClick={() => onEdit(course)} type="button">
                          Edit
                        </button>
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={() => onDelete(course.id)}
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
                  <td colSpan={5}>No courses yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
