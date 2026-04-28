import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminApi';
import '../styles/admin.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    const runId = `login-${Date.now()}`;
    // #region agent log
    fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H5',location:'client/src/admin/pages/AdminLoginPage.jsx:20',message:'Admin login submit triggered',data:{emailDomain:form.email.includes('@')?form.email.split('@')[1]:null,passwordProvided:Boolean(form.password)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    try {
      const response = await adminApi.login(form);
      const token = response?.data?.accessToken;
      const admin = response?.data?.admin;
      if (!token) throw new Error('Login failed');
      localStorage.setItem('admin_access_token', token);
      if (admin) localStorage.setItem('admin_user', JSON.stringify(admin));
      navigate('/admin');
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7905/ingest/eaded629-97a7-47cb-9dfd-e65da1eb1aed',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'02d6a5'},body:JSON.stringify({sessionId:'02d6a5',runId,hypothesisId:'H5',location:'client/src/admin/pages/AdminLoginPage.jsx:33',message:'Admin login failed in UI catch',data:{errorName:err?.name||null,errorMessage:err?.message||'unknown'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
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
