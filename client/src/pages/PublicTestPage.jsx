import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { testsApi } from '../api/adminApi';

export default function PublicTestPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [studentName, setStudentName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const studentToken = localStorage.getItem('student_access_token');

  async function onUnlock(event) {
    event.preventDefault();
    setError('');
    setIsBusy(true);
    try {
      if (!studentToken) {
        navigate('/login', { replace: true });
        return;
      }
      const response = await testsApi.verifyCode(slug, {
        code: code.trim(),
        studentName: studentName.trim() || null,
      }, studentToken);
      const data = response?.data;
      if (!data?.attemptToken || !data?.attemptId) {
        throw new Error('Could not start attempt. Please try again.');
      }
      sessionStorage.setItem(
        `test_attempt_${slug}`,
        JSON.stringify({ attemptId: data.attemptId, attemptToken: data.attemptToken })
      );
      navigate(`/tests/${slug}/start`, { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ display: 'grid', placeItems: 'center' }}>
        <article className="admin-card" style={{ width: 'min(100%, 520px)' }}>
          <h1 className="heading-2">Enter MRB Code</h1>
          <p className="body-md" style={{ marginTop: '0.5rem' }}>
            This test is protected. Enter your access code to unlock.
          </p>
          <form onSubmit={onUnlock} style={{ marginTop: '1rem' }}>
          <div className="admin-field">
            <label htmlFor="studentName">Student Name (optional)</label>
            <input
              id="studentName"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="admin-field" style={{ marginTop: '0.75rem' }}>
            <label htmlFor="mrbCode">MRB Code</label>
            <input
              id="mrbCode"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Enter code"
              required
            />
          </div>
          {error ? (
            <p className="admin-error" style={{ marginTop: '0.75rem' }}>
              {error}
            </p>
          ) : null}
          <button className="btn btn--primary" type="submit" style={{ marginTop: '0.9rem' }} disabled={isBusy}>
            {isBusy ? 'Verifying...' : 'Unlock Test'}
          </button>
          </form>
          {!studentToken ? (
            <p className="body-sm" style={{ marginTop: '0.75rem', color: 'var(--color-ink-500)' }}>
              Sign in first to access this test, then enter your MRB code.
            </p>
          ) : null}
          <p className="body-sm" style={{ marginTop: '0.35rem', color: 'var(--color-ink-500)' }}>
            Test URL identifies the paper, and MRB code unlocks it securely.
          </p>
        </article>
      </div>
    </section>
  );
}
