import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

const initialForm = {
  title: '',
  subject: 'MDCAT',
  description: '',
  price: 0,
  originalPrice: '',
  instructor: '',
  level: '',
  batchNumber: '',
  coverImage: '',
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
  const [imageUploading, setImageUploading] = useState(false);
  const imageInputRef = useRef(null);

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
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  async function onImageFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    setSuccess('');
    setImageUploading(true);
    try {
      const response = await adminApi.uploadCourseImage(token, file);
      const url = response?.data?.url;
      if (!url) throw new Error('Image upload returned no URL');
      setForm((prev) => ({ ...prev, coverImage: url }));
    } catch (err) {
      setError(err.message || 'Failed to upload image');
      if (imageInputRef.current) imageInputRef.current.value = '';
    } finally {
      setImageUploading(false);
    }
  }

  function clearCoverImage() {
    setForm((prev) => ({ ...prev, coverImage: '' }));
    if (imageInputRef.current) imageInputRef.current.value = '';
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
        batchNumber: form.batchNumber?.trim() || null,
        coverImage: form.coverImage?.trim() || null,
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
      batchNumber: course.batchNumber ?? '',
      coverImage: course.coverImage ?? '',
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
              <select id="subject" name="subject" value={form.subject} onChange={onChange} required>
                <option value="MDCAT">MDCAT</option>
              </select>
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
            <div className="admin-field">
              <label htmlFor="batchNumber">Batch Number</label>
              <input
                id="batchNumber"
                name="batchNumber"
                value={form.batchNumber}
                onChange={onChange}
                placeholder="e.g. Batch 2026-A"
              />
            </div>
            <div className="admin-field">
              <label htmlFor="coverImage">Image</label>
              <input
                id="coverImage"
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onImageFileChange}
                disabled={imageUploading}
              />
              <small style={{ color: 'var(--color-text-muted, #6b7280)' }}>
                {imageUploading
                  ? 'Uploading…'
                  : 'JPEG, PNG, WebP, or GIF. Max 5 MB.'}
              </small>
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" value={form.description} onChange={onChange} required />
          </div>

          {form.coverImage ? (
            <div className="admin-field">
              <span>Image preview</span>
              <div
                style={{
                  marginTop: '0.5rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <img
                  src={form.coverImage}
                  alt="Course cover preview"
                  style={{
                    maxWidth: '240px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #e5e7eb)',
                  }}
                />
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={clearCoverImage}
                  disabled={imageUploading}
                >
                  Remove image
                </button>
              </div>
            </div>
          ) : null}

          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} />
            Active
          </label>

          {error ? <p className="admin-error">{error}</p> : null}
          {success ? <p className="admin-success">{success}</p> : null}

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit" disabled={imageUploading}>
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
                <th>Image</th>
                <th>Title</th>
                <th>Subject</th>
                <th>Batch</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.length ? (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      {course.coverImage ? (
                        <img
                          src={course.coverImage}
                          alt={`${course.title} cover`}
                          style={{
                            width: '56px',
                            height: '40px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                          }}
                        />
                      ) : (
                        <span style={{ color: 'var(--color-text-muted, #9ca3af)' }}>—</span>
                      )}
                    </td>
                    <td>{course.title}</td>
                    <td>{course.subject}</td>
                    <td>{course.batchNumber || '—'}</td>
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
                  <td colSpan={7}>No courses yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
