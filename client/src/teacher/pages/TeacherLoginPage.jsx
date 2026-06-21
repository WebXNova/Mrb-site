import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { teacherApi } from '../../api/teacherApi';
import { getTeacherToken, setTeacherAuth } from '../../auth/session';
import '../../admin/styles/admin.css';

export default function TeacherLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getTeacherToken();
    if (token) navigate('/teacher/questions', { replace: true });
  }, [navigate]);

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await teacherApi.login(form);
      const teacher = response?.data?.teacher;
      if (!teacher?.id) throw new Error('Login failed');
      setTeacherAuth('__cookie_session__', teacher);
      navigate('/teacher/questions', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to login');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__card">
        <h1 className="heading-2">Teacher Login</h1>
        <p className="body-md" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          Sign in to access your teaching portal.
        </p>

        <form className="admin-page" onSubmit={onSubmit}>
          <div className="admin-field">
            <label htmlFor="identifier">Email or username</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              value={form.identifier}
              onChange={onChange}
              required
              autoComplete="username"
              placeholder="teacher@mrb.com"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={onChange}
              required
              minLength={8}
              autoComplete="current-password"
              placeholder="Enter password"
            />
          </div>

          {error ? <p className="admin-error">{error}</p> : null}

          <button className="btn btn--primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}
