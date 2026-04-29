import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import StudentTestsPage from './StudentTestsPage';
import StudentLecturesPage from './StudentLecturesPage';
import StudentResultsPage from './StudentResultsPage';

export default function StudentPortalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('student_access_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    async function load() {
      try {
        const response = await studentApi.dashboard();
        setData(response?.data || null);
      } catch (err) {
        setError(err.message || 'Failed to load student portal');
      }
    }
    load();
  }, [navigate]);

  if (error) {
    return (
      <section className="section"><div className="container"><p>{error}</p></div></section>
    );
  }
  if (!data) {
    return (
      <section className="section"><div className="container"><p>Loading portal...</p></div></section>
    );
  }

  return (
    <section className="admin-page">
      <section className="admin-grid">
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Available Tests</p>
          <p className="admin-stat-card__value">{data.tests.length}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Lectures</p>
          <p className="admin-stat-card__value">{data.lectures.length}</p>
        </article>
        <article className="admin-stat-card">
          <p className="admin-stat-card__label">Attempted Tests</p>
          <p className="admin-stat-card__value">{data.results.length}</p>
        </article>
      </section>
      <section className="admin-page">
        {(location.pathname === '/student' || location.pathname === '/student/tests') ? (
          <StudentTestsPage tests={data.tests} />
        ) : null}
        {(location.pathname === '/student' || location.pathname === '/student/lectures') ? (
          <StudentLecturesPage lectures={data.lectures} />
        ) : null}
        {(location.pathname === '/student' || location.pathname === '/student/results') ? (
          <StudentResultsPage results={data.results} />
        ) : null}
      </section>
    </section>
  );
}
