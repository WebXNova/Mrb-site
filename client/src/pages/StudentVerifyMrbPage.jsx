import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth-pages.css';

export default function StudentVerifyMrbPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  function onSubmit(event) {
    event.preventDefault();
    navigate('/dashboard');
  }

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h1 className="heading-2">Enter MRB Code</h1>
        <p className="auth-subtitle">Complete activation by entering your MRB enrollment code.</p>
        <form onSubmit={onSubmit} style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="mrbCode">MRB Code</label>
            <input
              id="mrbCode"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              required
            />
          </div>
          <button className="btn btn--primary" type="submit" style={{ marginTop: '1rem' }}>
            Verify Code
          </button>
        </form>
      </div>
    </section>
  );
}
