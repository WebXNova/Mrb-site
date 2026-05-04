import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { studentApi } from '../api/studentApi';
import { mockStudentDashboard } from '../student/data/mockStudentData';

export default function StudentResultDetailPage() {
  const { attemptId } = useParams();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await studentApi.resultDetail(attemptId);
        setResult(response?.data || mockStudentDashboard.results.find((item) => item.attemptId === attemptId) || null);
      } catch (err) {
        setError(err.message || '');
        setResult(mockStudentDashboard.results.find((item) => item.attemptId === attemptId) || null);
      }
    }
    load();
  }, [attemptId]);

  if (!result) return <section className="section"><div className="container"><p>Loading...</p></div></section>;

  return (
    <section className="section">
      <div className="container">
        <h1 className="heading-2">{result.testTitle}</h1>
        <p className="body-md" style={{ marginTop: '0.5rem' }}>
          Score {result.score}/{result.maxScore} ({result.percentage}%)
        </p>
        {error ? (
          <p className="admin-stat-card__label" style={{ marginTop: '0.4rem' }}>
            Showing preview result data until backend is connected.
          </p>
        ) : null}
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
