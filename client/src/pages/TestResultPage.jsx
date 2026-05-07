import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { testsApi } from '../api/adminApi';
import DOMPurify from 'dompurify';

function getAttemptSession(slug) {
  try {
    return JSON.parse(sessionStorage.getItem(`test_attempt_${slug}`) || '{}');
  } catch {
    return {};
  }
}

function setAttemptSession(slug, payload) {
  sessionStorage.setItem(`test_attempt_${slug}`, JSON.stringify(payload));
}

export default function TestResultPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const session = useMemo(() => getAttemptSession(slug), [slug]);
  const [attemptToken, setAttemptToken] = useState(session.attemptToken || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session.attemptId || !attemptToken) {
      navigate(`/tests/${slug}`, { replace: true });
      return;
    }
    async function loadResult() {
      try {
        const response = await testsApi.getResult(slug, session.attemptId, attemptToken);
        if (response?.data?.nextAttemptToken) {
          setAttemptSession(slug, { ...session, attemptToken: response.data.nextAttemptToken });
          setAttemptToken(response.data.nextAttemptToken);
        }
        setResult(response?.data || null);
      } catch (err) {
        setError(err.message || 'Could not load result');
      }
    }
    loadResult();
  }, [attemptToken, navigate, session.attemptId, slug]);

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <h1 className="heading-2">Result</h1>
          <p className="body-md" style={{ marginTop: '0.8rem' }}>
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="section">
        <div className="container">
          <p className="body-md">Loading result...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="heading-2">{result.testTitle}</h1>
        <p className="body-md" style={{ marginTop: '0.5rem' }}>
          Score: {result.score}/{result.maxScore} ({result.percentage}%)
        </p>
        <p className="body-md">
          Correct: {result.correctCount} | Wrong: {result.wrongCount} | Skipped: {result.skippedCount} | Time:{' '}
          {result.timeTakenSeconds}s
        </p>

        <div style={{ marginTop: '1rem' }}>
          <h2 className="heading-3">Review</h2>
          <ol style={{ marginTop: '0.75rem', paddingLeft: '1.2rem' }}>
            {(result.details || []).map((item) => (
              <li key={item.questionId} style={{ marginBottom: '1rem' }}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(item.questionText || ''),
                  }}
                />
                <p className="body-sm">Your answer: {item.selectedOption || '-'}</p>
                <p className="body-sm">Correct answer: {item.correctOption}</p>
                <p className="body-sm">Explanation: {item.explanation}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
