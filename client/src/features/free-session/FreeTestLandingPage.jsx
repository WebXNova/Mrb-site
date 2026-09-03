import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageLayout from '../../components/layout/PageLayout';
import { usePageSeo } from '../../seo/SeoContext';
import { standaloneTestsApi, markStandaloneSession } from '../../api/standaloneTestsApi';
import { setAttemptSession } from '../test-taking/utils/attemptSession';
import { getTestAccessErrorMessage } from '../test-instructions/utils/testAccessErrors';
import TestMetaGrid from '../test-instructions/components/TestMetaGrid';
import InstructionsSection from '../test-instructions/components/InstructionsSection';
import ResultPolicySection from '../test-instructions/components/ResultPolicySection';
import ExamFocusNote from '../test-instructions/components/ExamFocusNote';
import TestInstructionsEmpty from '../test-instructions/components/TestInstructionsEmpty';
import TestInstructionsError from '../test-instructions/components/TestInstructionsError';
import TestInstructionsSkeleton from '../test-instructions/components/TestInstructionsSkeleton';
import { formatSeatRemaining } from '../../utils/testSeatCopy';
import { formatStandaloneDateTime } from '../../utils/testCatalogAvailability';
import { freeTestPath, markFreeSessionGuest } from './freeSessionNav';
import '../test-instructions/styles/test-instructions.css';

const NAME_MAX = 80;

function validateName(raw) {
  const value = String(raw || '').replace(/\s+/g, ' ').trim();
  if (value.length < 2) return 'Enter your name to start the test.';
  if (value.length > NAME_MAX) return 'Name is too long.';
  if (/[<>]/.test(value) || /https?:\/\//i.test(value)) return 'Enter a valid name.';
  if (!/[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF]/.test(value)) return 'Enter a valid name.';
  return '';
}

export default function FreeTestLandingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [studentName, setStudentName] = useState('');
  const [nameError, setNameError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const startingRef = useRef(false);
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  usePageSeo({
    title: meta?.title ? `${meta.title} | MRB Classes` : 'Free session | MRB Classes',
    description: 'Free practice session. Enter your name to begin. No account is required before the test.',
    noindex: true,
  });

  const load = useCallback(async (maybeCancelled) => {
    const isCancelled = typeof maybeCancelled === 'function' ? maybeCancelled : () => false;
    const normalized = String(slug || '').trim();
    if (!normalized) {
      setStatus('empty');
      setError('Invalid test link.');
      return;
    }
    setStatus((prev) => (startingRef.current ? prev : 'loading'));
    setError('');
    try {
      markStandaloneSession(normalized, 'free_standalone');
      const [detailResponse, sessionResponse] = await Promise.all([
        standaloneTestsApi.publicDetail(normalized),
        standaloneTestsApi.freeSessionStatus(normalized).catch(() => null),
      ]);
      if (isCancelled() || startingRef.current) return;
      const detail = detailResponse?.data;
      if (!detail?.title || detail.accessKind !== 'free_standalone') {
        setMeta(null);
        setStatus('empty');
        return;
      }
      if (detail.listingStatus === 'expired' && sessionResponse?.data?.nextStep !== 'exam') {
        setMeta(detail);
        setError('This test is no longer available.');
        setStatus('error');
        return;
      }
      setMeta(detail);

      const session = sessionResponse?.data;
      if (session?.nextStep === 'exam' && session.attemptId) {
        markFreeSessionGuest(normalized, true);
        setAttemptSession(normalized, {
          attemptId: session.attemptId,
          expiresAt: session.expiresAt ?? null,
          accessKind: 'free_standalone',
        });
        navigateRef.current(freeTestPath(normalized, 'start'), { replace: true });
        return;
      }
      if (session?.nextStep === 'enrollment') {
        markFreeSessionGuest(normalized, true);
        navigateRef.current(freeTestPath(normalized, 'enroll'), { replace: true });
        return;
      }
      if (session?.nextStep === 'account') {
        markFreeSessionGuest(normalized, true);
        navigateRef.current(freeTestPath(normalized, 'claim'), { replace: true });
        return;
      }
      if (session?.studentName) setStudentName(session.studentName);

      if (Number(detail.questionCount) <= 0) {
        setStatus('empty');
        return;
      }
      setStatus('ready');
    } catch (err) {
      if (isCancelled() || startingRef.current) return;
      setError(getTestAccessErrorMessage(err, 'This test is not available.'));
      setStatus('error');
    }
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onStart(event) {
    event.preventDefault();
    if (startingRef.current) return;
    const invalid = validateName(studentName);
    if (invalid) {
      setNameError(invalid);
      return;
    }
    setNameError('');
    setStartError('');
    startingRef.current = true;
    setIsStarting(true);
    try {
      const response = await standaloneTestsApi.freeSessionStart(slug, { studentName: studentName.trim() });
      const data = response?.data;
      if (data?.submitted || data?.nextStep === 'enrollment' || data?.nextStep === 'account') {
        markFreeSessionGuest(slug, true);
        navigateRef.current(freeTestPath(slug, data.nextStep === 'account' ? 'claim' : 'enroll'), { replace: true });
        return;
      }
      if (!data?.attemptId) {
        throw new Error('Could not start the test. Please try again.');
      }
      markStandaloneSession(slug, 'free_standalone');
      markFreeSessionGuest(slug, true);
      setAttemptSession(slug, {
        attemptId: data.attemptId,
        expiresAt: data.expiresAt ?? null,
        accessKind: 'free_standalone',
      });
      navigateRef.current(freeTestPath(slug, 'start'), { replace: true });
    } catch (err) {
      startingRef.current = false;
      setIsStarting(false);
      setStartError(getTestAccessErrorMessage(err, 'Unable to start the test.'));
    }
  }

  if (status === 'loading') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsSkeleton />
        </div>
      </PageLayout>
    );
  }

  if (status === 'empty') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsEmpty slug={slug} />
        </div>
      </PageLayout>
    );
  }

  if (status === 'error') {
    return (
      <PageLayout>
        <div className="ti-shell">
          <TestInstructionsError message={error} onRetry={load} />
        </div>
      </PageLayout>
    );
  }

  const seats = formatSeatRemaining(meta?.seatsRemaining, meta?.seatCapacity);
  const availability = meta?.availability || {};
  const blocked =
    meta?.examOpen === false ||
    seats.isFull ||
    availability.notYetAvailable ||
    availability.noLongerAvailable;
  const blockedMessage = availability.notYetAvailable
    ? `This test has not started yet.${availability.startDate ? ` Starts ${formatStandaloneDateTime(availability.startDate)}.` : ''}`
    : availability.noLongerAvailable
      ? 'This session has ended.'
      : seats.isFull
        ? seats.label
        : meta?.examOpen === false
          ? 'This test is currently closed by the administrator.'
          : '';

  return (
    <PageLayout>
      <div className="ti-shell">
        <div className="ti-page">
          <header className="ti-header">
            <p className="ti-eyebrow">Free session</p>
            <h1 className="ti-title">{meta?.title || 'Free session'}</h1>
            {meta?.subject ? (
              <p className="ti-subtitle">
                Subject: <span>{meta.subject}</span>
              </p>
            ) : null}
          </header>

          <TestMetaGrid meta={meta} />
          {meta?.description ? (
            <section className="ti-instructions">
              <h2>About this session</h2>
              <p>{meta.description}</p>
            </section>
          ) : (
            <InstructionsSection meta={meta} />
          )}
          <ResultPolicySection meta={meta} />
          <ExamFocusNote />

          <section className="ti-start" aria-labelledby="free-session-start-heading">
            <h2 id="free-session-start-heading">Enter your name</h2>
            <p className="ti-start__lede">
              You do not need an account to begin. After you submit the test, you will complete your
              information and sign in to save your result.
            </p>
            {blocked ? (
              <p className="ti-callout ti-callout--warn" role="status">
                {blockedMessage}
              </p>
            ) : null}
            <form className="ti-start__form" onSubmit={onStart} noValidate>
              <div className="ti-field">
                <label htmlFor="free-session-name">Your name</label>
                <input
                  id="free-session-name"
                  name="studentName"
                  type="text"
                  value={studentName}
                  onChange={(event) => {
                    setStudentName(event.target.value);
                    if (nameError) setNameError('');
                  }}
                  maxLength={NAME_MAX}
                  autoComplete="name"
                  disabled={isStarting || blocked}
                  required
                />
                {nameError ? (
                  <p className="ti-form-error" role="alert">
                    {nameError}
                  </p>
                ) : null}
              </div>
              {startError ? (
                <p className="ti-form-error" role="alert">
                  {startError}
                </p>
              ) : null}
              <button
                type="submit"
                className="btn btn--primary ti-start__button"
                disabled={isStarting || blocked}
                aria-busy={isStarting}
              >
                {isStarting ? 'Starting…' : 'Start test'}
              </button>
            </form>
            <footer className="ti-start__footer">
              <p>
                <Link to="/paid-tests" className="ti-link-muted">
                  Back to tests
                </Link>
              </p>
            </footer>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
