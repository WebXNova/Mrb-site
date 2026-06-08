import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminTestPageHeader from '../components/AdminTestPageHeader';
import TestWizardNav, { getTestWizardPreviousStep } from '../components/TestWizardNav';
import { testPageHeading, useTestTitle } from '../hooks/useTestTitle';
import { TestWizardProgress } from '../components/TestWizardProgress';
import { useTestCompleteness } from '../hooks/useTestCompleteness';
import { isTestPublishedStatus } from '../utils/testBasicInfoValidation';

const MAX_SELECTION_BUFFER = 100;
const LARGE_REMOVE_CONFIRM_THRESHOLD = 10;

function previewText(value, max = 120) {
  const plain = DOMPurify.sanitize(String(value ?? ''), { ALLOWED_TAGS: [] }).trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}…`;
}

export default function AdminTestQuestionsPage() {
  const token = getAdminToken();
  const navigate = useNavigate();
  const { testId } = useParams();
  const testTitle = useTestTitle(testId);
  const { completeness, reload: reloadCompleteness } = useTestCompleteness(testId);

  const [courseId, setCourseId] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [linkedQuestions, setLinkedQuestions] = useState([]);
  const [availableQuestions, setAvailableQuestions] = useState([]);
  const [availablePagination, setAvailablePagination] = useState(null);

  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);

  const [bankSelection, setBankSelection] = useState([]);
  const [linkedSelection, setLinkedSelection] = useState([]);

  const [testStatus, setTestStatus] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isBankBusy, setIsBankBusy] = useState(false);
  const [isLinkedBusy, setIsLinkedBusy] = useState(false);

  const questionsLocked = isTestPublishedStatus(testStatus);

  const linkedIdSet = useMemo(
    () => new Set(linkedQuestions.map((q) => Number(q.questionId))),
    [linkedQuestions]
  );

  const loadLinkedQuestions = useCallback(async () => {
    const response = await adminApi.testQuestions(token, testId);
    setLinkedQuestions(response?.data?.questions || []);
  }, [token, testId]);

  const loadAvailableQuestions = useCallback(
    async ({ nextPage = page, nextSearch = search, nextSubjectId = subjectId, nextDifficulty = difficulty } = {}) => {
      const query = { page: nextPage, limit: 20 };
      if (nextSearch.trim()) query.search = nextSearch.trim();
      if (nextSubjectId) query.subject_id = Number(nextSubjectId);
      if (nextDifficulty) query.difficulty = nextDifficulty;

      const response = await adminApi.availableTestQuestions(token, testId, query);
      setAvailableQuestions(response?.data?.items || []);
      setAvailablePagination(response?.data?.pagination || null);
      if (response?.data?.test?.courseId) {
        setCourseId(Number(response.data.test.courseId));
      }
    },
    [token, testId, page, search, subjectId, difficulty]
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setError('');
      try {
        await loadLinkedQuestions();
        await loadAvailableQuestions({ nextPage: 1 });
        if (cancelled) return;

        const testResponse = await adminApi.getTest(token, testId);
        const testRow = testResponse?.data;
        if (testRow?.status) setTestStatus(testRow.status);
        const cid = testRow?.courseId;
        if (cid) {
          setCourseId(Number(cid));
          const subjectsResponse = await adminApi.subjects(token, cid);
          setSubjects(Array.isArray(subjectsResponse?.data) ? subjectsResponse.data : []);
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load question linking data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [token, testId, loadLinkedQuestions, loadAvailableQuestions]);

  function toggleBankSelection(questionId) {
    const id = Number(questionId);
    setBankSelection((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= MAX_SELECTION_BUFFER) return prev;
      if (linkedIdSet.has(id)) return prev;
      return [...prev, id];
    });
  }

  function toggleLinkedSelection(questionId) {
    const id = Number(questionId);
    setLinkedSelection((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function onSearchSubmit(event) {
    event.preventDefault();
    setPage(1);
    setIsBankBusy(true);
    setError('');
    try {
      await loadAvailableQuestions({ nextPage: 1 });
    } catch (err) {
      setError(err.message || 'Failed to search questions.');
    } finally {
      setIsBankBusy(false);
    }
  }

  async function addSelectedQuestions() {
    if (questionsLocked) return;
    if (!bankSelection.length) {
      setError('Select at least one question to add.');
      return;
    }

    setIsBankBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await adminApi.linkTestQuestionsBulk(token, testId, bankSelection);
      const added = Number(response?.data?.added ?? 0);
      const skipped = Number(response?.data?.skipped_duplicates ?? 0);
      setSuccess(`Added ${added} question(s)${skipped ? `, skipped ${skipped} duplicate(s)` : ''}.`);
      setBankSelection([]);
      await loadLinkedQuestions();
      await loadAvailableQuestions({ nextPage: page });
      await reloadCompleteness();
    } catch (err) {
      setError(err.message || 'Failed to add selected questions.');
    } finally {
      setIsBankBusy(false);
    }
  }

  async function removeSelectedQuestions() {
    if (questionsLocked) return;
    if (!linkedSelection.length) {
      setError('Select at least one linked question to remove.');
      return;
    }

    if (linkedSelection.length >= LARGE_REMOVE_CONFIRM_THRESHOLD) {
      const confirmed = window.confirm(`Remove ${linkedSelection.length} linked questions from this test?`);
      if (!confirmed) return;
    }

    setIsLinkedBusy(true);
    setError('');
    setSuccess('');
    try {
      const response = await adminApi.unlinkTestQuestionsBulk(token, testId, linkedSelection);
      const removed = Number(response?.data?.removed ?? linkedSelection.length);
      setSuccess(`Removed ${removed} question(s) from the test.`);
      setLinkedSelection([]);
      await loadLinkedQuestions();
      await loadAvailableQuestions({ nextPage: page });
      await reloadCompleteness();
    } catch (err) {
      setError(err.message || 'Failed to remove selected questions.');
    } finally {
      setIsLinkedBusy(false);
    }
  }

  async function changePage(nextPage) {
    setPage(nextPage);
    setIsBankBusy(true);
    setError('');
    try {
      await loadAvailableQuestions({ nextPage });
    } catch (err) {
      setError(err.message || 'Failed to load questions page.');
    } finally {
      setIsBankBusy(false);
    }
  }

  const previousStep = getTestWizardPreviousStep('questions', testId);

  return (
    <section className="admin-page admin-page--tests">
      <section className="admin-card">
        <AdminTestPageHeader
          title={testPageHeading(testTitle, testId)}
          previousTo={previousStep?.to}
          previousLabel={previousStep?.label}
        />
        <p className="admin-test-step-label">Step 4 — Question linking</p>

        <TestWizardNav testId={testId} activeStep="questions" />

        <TestWizardProgress completeness={completeness} />

        {questionsLocked ? (
          <p className="admin-test-alert admin-test-alert--locked" role="alert">
            This test is published and cannot be modified.
          </p>
        ) : null}

        {isLoading ? (
          <p className="body-md admin-courses__muted">Loading question bank…</p>
        ) : (
          <>
            <section className="admin-card" style={{ marginTop: '1rem' }}>
              <div className="admin-test-question-bank__header">
                <div>
                  <h2 className="heading-4">Question Bank</h2>
                  <p className="admin-field__hint" style={{ marginTop: '0.35rem' }}>
                    Link existing questions to this test, or create a new one in the question bank.
                  </p>
                </div>
                <Link
                  className="btn btn--primary btn--sm"
                  to={`/admin/question-bank/new?returnTo=${encodeURIComponent(`/admin/tests/${testId}/questions`)}${courseId ? `&courseId=${courseId}` : ''}`}
                >
                  + Create new question
                </Link>
              </div>
              <form className="admin-form-grid" style={{ marginTop: '0.75rem' }} onSubmit={onSearchSubmit}>
                <div className="admin-field">
                  <label htmlFor="search">Search</label>
                  <input
                    id="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search question text"
                    disabled={isBankBusy || questionsLocked}
                  />
                </div>
                <div className="admin-field">
                  <label htmlFor="subjectId">Subject</label>
                  <select
                    id="subjectId"
                    value={subjectId}
                    onChange={(e) => setSubjectId(e.target.value)}
                    disabled={isBankBusy || questionsLocked}
                  >
                    <option value="">All subjects</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name || subject.title || `Subject #${subject.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field">
                  <label htmlFor="difficulty">Difficulty</label>
                  <select
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    disabled={isBankBusy || questionsLocked}
                  >
                    <option value="">All</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </form>
              <div className="admin-actions" style={{ marginTop: '0.5rem' }}>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  disabled={isBankBusy || questionsLocked}
                  onClick={onSearchSubmit}
                >
                  Search
                </button>
                <button
                  className="btn btn--primary btn--sm"
                  type="button"
                  disabled={isBankBusy || questionsLocked || !bankSelection.length}
                  onClick={addSelectedQuestions}
                >
                  {isBankBusy ? 'Adding…' : `Add Selected (${bankSelection.length})`}
                </button>
              </div>

              <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>ID</th>
                      <th>Question</th>
                      <th>Subject</th>
                      <th>Difficulty</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {availableQuestions.length ? (
                      availableQuestions.map((q) => {
                        const id = Number(q.questionId);
                        const alreadyLinked = linkedIdSet.has(id);
                        return (
                          <tr key={id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={bankSelection.includes(id)}
                                disabled={alreadyLinked || isBankBusy}
                                onChange={() => toggleBankSelection(id)}
                              />
                            </td>
                            <td>{id}</td>
                            <td>{previewText(q.questionText)}</td>
                            <td>{q.subjectId || '-'}</td>
                            <td>{q.difficulty || '-'}</td>
                            <td>{q.marks}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={6}>No available questions for this filter.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {availablePagination ? (
                <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    disabled={isBankBusy || questionsLocked || availablePagination.page <= 1}
                    onClick={() => changePage(availablePagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span className="admin-courses__muted">
                    Page {availablePagination.page} of {availablePagination.totalPages || 1}
                  </span>
                  <button
                    className="btn btn--secondary btn--sm"
                    type="button"
                    disabled={
                      isBankBusy || questionsLocked || availablePagination.page >= (availablePagination.totalPages || 1)
                    }
                    onClick={() => changePage(availablePagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>

            <section className="admin-card" style={{ marginTop: '1rem' }}>
              <h2 className="heading-4">Selected Questions ({linkedQuestions.length})</h2>
              <div className="admin-actions" style={{ marginTop: '0.75rem' }}>
                <button
                  className="btn btn--secondary btn--sm"
                  type="button"
                  disabled={isLinkedBusy || questionsLocked || !linkedSelection.length}
                  onClick={removeSelectedQuestions}
                >
                  {isLinkedBusy ? 'Removing…' : `Remove Selected (${linkedSelection.length})`}
                </button>
              </div>

              <div className="admin-table-wrap" style={{ marginTop: '0.75rem' }}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>#</th>
                      <th>ID</th>
                      <th>Preview</th>
                      <th>Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linkedQuestions.length ? (
                      linkedQuestions.map((q, index) => {
                        const id = Number(q.questionId);
                        return (
                          <tr key={q.linkId || id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={linkedSelection.includes(id)}
                                disabled={isLinkedBusy || questionsLocked}
                                onChange={() => toggleLinkedSelection(id)}
                              />
                            </td>
                            <td>{index + 1}</td>
                            <td>{id}</td>
                            <td>{previewText(q.questionText)}</td>
                            <td>{q.effectiveMarks ?? q.marks}</td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5}>No questions linked yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {error ? <p className="admin-error">{error}</p> : null}
            {success ? <p className="admin-success">{success}</p> : null}

            <div className="admin-test-form__footer">
              {previousStep ? (
                <Link className="btn btn--secondary" to={previousStep.to}>
                  ← {previousStep.label}
                </Link>
              ) : null}
              <button className="btn btn--secondary" type="button" onClick={() => navigate('/admin/tests')}>
                Back to Tests
              </button>
              <button
                className="btn btn--secondary"
                type="button"
                disabled={questionsLocked || !completeness.can_publish}
                title={
                  completeness.can_publish
                    ? 'All wizard steps complete — publish from the Tests list'
                    : `Cannot publish yet. Missing: ${(completeness.missing_fields || []).join(', ') || 'required fields'}`
                }
                onClick={async () => {
                  if (!completeness.can_publish) return;
                  try {
                    await adminApi.publishTest(token, testId);
                    navigate('/admin/tests');
                  } catch (err) {
                    setError(err.message || 'Failed to publish test.');
                  }
                }}
              >
                Publish Test
              </button>
            </div>
          </>
        )}
      </section>
    </section>
  );
}
