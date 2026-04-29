import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import '../styles/admin.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_access_token');
    if (token) navigate('/admin', { replace: true });
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
      const response = await adminApi.login(form);
      const token = response?.data?.accessToken;
      const admin = response?.data?.admin;
      if (!token) throw new Error('Login failed');
      localStorage.setItem('admin_access_token', token);
      if (admin) localStorage.setItem('admin_user', JSON.stringify(admin));
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message || 'Unable to login');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-login">
      <section className="admin-login__card">
        <h1 className="heading-2">Admin Login</h1>
        <p className="body-md" style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>
          Sign in to manage courses, tests, lectures, and platform operations.
        </p>

        <form className="admin-page" onSubmit={onSubmit}>
          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={onChange}
              required
              placeholder="admin@mrb.com"
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
