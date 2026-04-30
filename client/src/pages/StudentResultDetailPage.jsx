import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';

export default function StudentResultDetailPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('student_access_token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    async function load() {
      try {
        const response = await studentApi.resultDetail(attemptId);
        setResult(response?.data || null);
      } catch (err) {
        setError(err.message || 'Failed to load result');
      }
    }
    load();
  }, [attemptId, navigate]);

  if (error) return <section className="section"><div className="container"><p>{error}</p></div></section>;
  if (!result) return <section className="section"><div className="container"><p>Loading...</p></div></section>;

  return (
    <section className="section">
      <div className="container">
        <h1 className="heading-2">{result.testTitle}</h1>
        <p className="body-md" style={{ marginTop: '0.5rem' }}>
          Score {result.score}/{result.maxScore} ({result.percentage}%)
        </p>
        <p className="body-md">
          Correct {result.correctCount} | Wrong {result.wrongCount} | Unanswered {result.skippedCount}
        </p>
        <ol style={{ marginTop: '1rem', paddingLeft: '1.2rem' }}>
          {(result.details || []).map((item) => (
            <li key={item.questionId} style={{ marginBottom: '0.8rem' }}>
              <div dangerouslySetInnerHTML={{ __html: item.questionText }} />
              <div>Your answer: {item.selectedOption || '-'}</div>
              <div>Correct: {item.correctOption}</div>
              <div>Explanation: {item.explanation}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
