import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { testsApi } from '../api/adminApi';
import '../styles/test-attempt.css';

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

export default function TestAttemptPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);

  const session = useMemo(() => getAttemptSession(slug), [slug]);
  const [attemptToken, setAttemptToken] = useState(session.attemptToken || '');

  useEffect(() => {
    if (!session.attemptId || !attemptToken) {
      navigate(`/tests/${slug}`, { replace: true });
      return;
    }

    async function loadStart() {
      try {
        const response = await testsApi.getStartData(slug, session.attemptId, attemptToken);
        if (response?.data?.nextAttemptToken) {
          setAttemptSession(slug, { ...session, attemptToken: response.data.nextAttemptToken });
          setAttemptToken(response.data.nextAttemptToken);
        }
        setPayload(response?.data || null);
        const expiresAt = new Date(response?.data?.attempt?.expiresAt || Date.now()).getTime();
        setTimeLeft(Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)));
      } catch (err) {
        setError(err.message || 'Unable to start test.');
      }
    }

    loadStart();
  }, [attemptToken, navigate, session.attemptId, slug]);

  useEffect(() => {
    if (timeLeft === null) return undefined;
    if (timeLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0) {
      submitNow(true);
    }
  }, [timeLeft]);

  const questions = payload?.test?.questions || [];
  const currentQuestion = questions[index];

  function formatTimer(value) {
    const mins = Math.floor(value / 60);
    const secs = value % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  async function selectAnswer(questionId, selectedOption) {
    if (!questionId) return;
    setAnswers((prev) => ({ ...prev, [questionId]: selectedOption }));
    try {
      const response = await testsApi.saveAnswer(slug, session.attemptId, attemptToken, {
        questionId,
        selectedOption,
      });
      if (response?.data?.nextAttemptToken) {
        setAttemptSession(slug, { ...session, attemptToken: response.data.nextAttemptToken });
        setAttemptToken(response.data.nextAttemptToken);
      }
    } catch (err) {
      setError(err.message || 'Auto-save failed');
    }
  }

  async function submitNow(force = false) {
    if (!force && !window.confirm('Submit attempt now?')) return;
    setIsBusy(true);
    setError('');
    try {
      const response = await testsApi.submitAttempt(slug, session.attemptId, attemptToken);
      if (response?.data?.nextAttemptToken) {
        setAttemptSession(slug, { ...session, attemptToken: response.data.nextAttemptToken });
        setAttemptToken(response.data.nextAttemptToken);
      }
      navigate(`/tests/${slug}/result`, { replace: true });
    } catch (err) {
      setError(err.message || 'Submit failed');
    } finally {
      setIsBusy(false);
    }
  }

  if (error && !payload) {
    return (
      <section className="section">
        <div className="container">
          <h1 className="heading-2">Test Attempt</h1>
          <p className="body-md" style={{ marginTop: '0.8rem' }}>
            {error}
          </p>
        </div>
      </section>
    );
  }

  if (!payload) {
    return (
      <section className="section">
        <div className="container">
          <p className="body-md">Loading attempt...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container test-shell">
        <h1 className="heading-2">{payload.test.title}</h1>
        <p className="body-md" style={{ marginTop: '0.5rem' }}>
          Question {index + 1} of {questions.length}
        </p>
        <p className="body-md" style={{ marginTop: '0.25rem' }}>
          Time Left: {formatTimer(timeLeft || 0)}
        </p>
        {error ? (
          <p className="admin-error" style={{ marginTop: '0.75rem' }}>
            {error}
          </p>
        ) : null}

        {currentQuestion ? (
          <article className="test-card" style={{ marginTop: '1rem' }}>
            <div dangerouslySetInnerHTML={{ __html: currentQuestion.questionText }} />
            <div className="test-options">
              {currentQuestion.options.map((option) => (
                <label
                  key={`${currentQuestion.id}-${option.id}`}
                  className={`test-option ${answers[currentQuestion.id] === option.id ? 'test-option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`question-${currentQuestion.id}`}
                    checked={answers[currentQuestion.id] === option.id}
                    onChange={() => selectAnswer(currentQuestion.id, option.id)}
                  />
                  <span>{option.text}</span>
                </label>
              ))}
            </div>
            <div className="test-nav-grid">
              {questions.map((question, questionIndex) => (
                <button
                  key={question.id}
                  type="button"
                  className={`test-nav-dot ${answers[question.id] ? 'test-nav-dot--answered' : ''} ${
                    questionIndex === index ? 'test-nav-dot--active' : ''
                  }`}
                  onClick={() => setIndex(questionIndex)}
                >
                  {questionIndex + 1}
                </button>
              ))}
            </div>
          </article>
        ) : null}

        <div className="admin-row-actions" style={{ marginTop: '1rem' }}>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
            disabled={index === 0}
          >
            Previous
          </button>
          <button
            className="btn btn--secondary btn--sm"
            type="button"
            onClick={() => setIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            disabled={index === questions.length - 1}
          >
            Next
          </button>
          <button className="btn btn--primary btn--sm" type="button" onClick={submitNow} disabled={isBusy}>
            {isBusy ? 'Submitting...' : 'Submit Test'}
          </button>
        </div>
      </div>
    </section>
  );
}
