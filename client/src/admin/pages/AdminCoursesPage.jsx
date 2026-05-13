import { useEffect, useRef, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken, getStoredUser } from '../../auth/session';

const LEVEL_OPTIONS = ['beginner', 'intermediate', 'advanced'];

const initialForm = {
  title: '',
  description: '',
  short_description: '',
  level: 'beginner',
  thumbnail_url: '',
  is_active: true,
};

export default function AdminCoursesPage() {
  const token = getAdminToken();
  const adminUser = typeof window !== 'undefined' ? getStoredUser('admin_user') : null;
  const isSuperAdmin = adminUser?.role === 'super_admin';
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
      setForm((prev) => ({ ...prev, thumbnail_url: url }));
    } catch (err) {
      setError(err.message || 'Failed to upload image');
      if (imageInputRef.current) imageInputRef.current.value = '';
    } finally {
      setImageUploading(false);
    }
  }

  function clearCoverImage() {
    setForm((prev) => ({ ...prev, thumbnail_url: '' }));
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function buildCourseWritePayload() {
    const sd = form.short_description?.trim();
    return {
      title: form.title,
      description: form.description,
      short_description: sd === '' ? null : sd ?? null,
      level: form.level || 'beginner',
      thumbnail_url: form.thumbnail_url?.trim() || null,
      is_active: !!form.is_active,
    };
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const payload = buildCourseWritePayload();
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

  async function onArchive(courseId) {
    if (
      !window.confirm(
        'Hide this course from the catalog? It will be archived — lectures stay attached until you purge the course.'
      )
    )
      return;
    setError('');
    try {
      await adminApi.deleteCourse(token, courseId);
      await loadCourses();
      setSuccess('Course archived.');
    } catch (err) {
      setError(err.message || 'Failed to archive course');
    }
  }

  async function onPurge(course) {
    if (
      !window.confirm(
        `PERMANENTLY delete "${course.title}"? This removes the catalog row.${
          isSuperAdmin
            ? ' If lectures are attached you will be prompted to confirm cascade deletion.'
            : ''
        }`
      )
    )
      return;
    setError('');
    try {
      await adminApi.deleteCourse(token, course.id, { purge: true });
      await loadCourses();
      setSuccess('Course permanently deleted.');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('lecture') && isSuperAdmin) {
        if (
          window.confirm(
            'This course still has lectures. Delete the course and ALL attached lectures? This cannot be undone.'
          )
        ) {
          try {
            await adminApi.deleteCourse(token, course.id, { purge: true, forceCascade: true });
            await loadCourses();
            setSuccess('Course and lectures permanently deleted.');
          } catch (e2) {
            setError(e2.message || 'Failed to purge course');
          }
        }
        return;
      }
      setError(msg || 'Failed to purge course');
    }
  }

  function onEdit(course) {
    setEditingId(course.id);
    setForm({
      ...initialForm,
      title: course.title ?? '',
      description: course.description ?? '',
      short_description: course.short_description ?? '',
      level: LEVEL_OPTIONS.includes(course.level) ? course.level : 'beginner',
      thumbnail_url: course.thumbnail_url ?? '',
      is_active: !!course.is_active,
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
              <label htmlFor="level">Level</label>
              <select id="level" name="level" value={form.level} onChange={onChange} required>
                {LEVEL_OPTIONS.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-field">
              <label htmlFor="course_image">Image</label>
              <input
                id="course_image"
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={onImageFileChange}
                disabled={imageUploading}
              />
              <small style={{ color: 'var(--color-text-muted, #6b7280)' }}>
                {imageUploading ? 'Uploading…' : 'JPEG, PNG, WebP, or GIF. Max 5 MB.'}
              </small>
            </div>
          </div>

          <div className="admin-field">
            <label htmlFor="short_description">Short description (optional)</label>
            <textarea
              id="short_description"
              name="short_description"
              value={form.short_description}
              onChange={onChange}
              rows={2}
              maxLength={512}
              placeholder="Summary shown in listings when set"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="description">Description</label>
            <textarea id="description" name="description" value={form.description} onChange={onChange} required />
          </div>

          {form.thumbnail_url ? (
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
                  src={form.thumbnail_url}
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
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={onChange} />
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
                <th>ID</th>
                <th>Title</th>
                <th>Level</th>
                <th>Created by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.length ? (
                courses.map((course) => (
                  <tr key={course.id}>
                    <td>
                      {course.thumbnail_url ? (
                        <img
                          src={course.thumbnail_url}
                          alt=""
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
                    <td>{course.id}</td>
                    <td>{course.title}</td>
                    <td>{course.level}</td>
                    <td>{course.created_by ?? '—'}</td>
                    <td>{course.is_active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="admin-row-actions">
                        <button className="btn btn--secondary btn--sm" onClick={() => onEdit(course)} type="button">
                          Edit
                        </button>
                        <button
                          className="btn btn--secondary btn--sm"
                          onClick={() => onArchive(course.id)}
                          type="button"
                          title="Hide from public catalog (soft)"
                        >
                          Archive
                        </button>
                        {isSuperAdmin ? (
                          <button
                            className="btn btn--secondary btn--sm"
                            onClick={() => onPurge(course)}
                            type="button"
                            title="Hard delete (requires empty course or cascade)"
                          >
                            Purge
                          </button>
                        ) : null}
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
