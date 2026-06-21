import { useEffect, useMemo, useState } from 'react';
import { getAdminToken } from '../../auth/session';
import { adminApi } from '../../api/adminApi';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import AdminLoadingButton from '../components/AdminLoadingButton';
import { useCourseSubjects } from '../hooks/useCourseSubjects';
import {
  MAX_QUESTION_TOPIC_LENGTH,
  QUESTION_DIFFICULTY_OPTIONS,
} from '../constants/questionBank.constants';
import { formatStructuredImportError } from '../../features/quiz-builder/utils/aikenImportFormatters.js';

const EMPTY_FORM = {
  course_id: '',
  subject_id: '',
  topic: '',
  difficulty: '',
  duplicate_policy: 'skip',
  content: '',
};

function buildImportPayload(form) {
  const payload = {
    course_id: Number(form.course_id),
    content: String(form.content).trim(),
    duplicate_policy: String(form.duplicate_policy || 'skip'),
  };

  const subjectId = Number(form.subject_id);
  if (Number.isInteger(subjectId) && subjectId > 0) {
    payload.subject_id = subjectId;
  }

  const topic = String(form.topic ?? '').trim();
  if (topic) {
    payload.topic = topic;
  }

  const difficulty = String(form.difficulty ?? '').trim();
  if (difficulty) {
    payload.difficulty = difficulty;
  }

  return payload;
}

export default function AdminQuestionImportPage() {
  const token = getAdminToken();
  const [form, setForm] = useState(EMPTY_FORM);
  const [courses, setCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [importState, setImportState] = useState('idle');
  const [previewState, setPreviewState] = useState('idle');
  const [requestError, setRequestError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [result, setResult] = useState(null);

  const { subjects, isLoading: isLoadingSubjects, error: subjectsError } = useCourseSubjects(
    token,
    form.course_id
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCourses(true);
    setCoursesError('');
    adminApi
      .courses(token)
      .then((response) => {
        if (cancelled) return;
        setCourses(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCourses([]);
        setCoursesError(safeAdminErrorMessage(err, 'Could not load courses.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const courseSelected = Boolean(form.course_id);
  const isImporting = importState === 'loading';
  const isPreviewing = previewState === 'loading';
  const fieldsDisabled = isImporting || isPreviewing || isLoadingCourses || Boolean(coursesError);

  const difficultyOptions = useMemo(
    () => QUESTION_DIFFICULTY_OPTIONS.filter((option) => option.value !== ''),
    []
  );

  function showError(fieldName) {
    return Boolean(touched[fieldName] && fieldErrors[fieldName]);
  }

  function validateForm() {
    /** @type {Record<string, string>} */
    const nextErrors = {};
    const courseId = Number(form.course_id);
    if (!Number.isInteger(courseId) || courseId <= 0) {
      nextErrors.course_id = 'Course is required.';
    }
    if (!String(form.content ?? '').trim()) {
      nextErrors.content = 'Aiken content is required.';
    }
    if (String(form.topic ?? '').length > MAX_QUESTION_TOPIC_LENGTH) {
      nextErrors.topic = `Topic must not exceed ${MAX_QUESTION_TOPIC_LENGTH} characters.`;
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function resetOutcomeState() {
    setImportState('idle');
    setRequestError('');
    setResult(null);
    setPreviewState('idle');
    setPreviewError('');
    setPreviewResult(null);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'course_id') {
        next.subject_id = '';
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    if (importState !== 'idle' || previewState !== 'idle' || result || previewResult) {
      resetOutcomeState();
    }
  }

  function handleBlur(event) {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateForm();
  }

  async function handlePreview(event) {
    event.preventDefault();
    setTouched({ course_id: true, content: true, topic: true });
    if (!validateForm()) {
      return;
    }

    setPreviewState('loading');
    setPreviewError('');
    setPreviewResult(null);
    setImportState('idle');
    setRequestError('');
    setResult(null);

    try {
      const response = await adminApi.previewAikenImport(token, buildImportPayload(form));
      setPreviewResult({
        imported: Number(response?.imported ?? 0),
        skippedDuplicates: Number(response?.skippedDuplicates ?? 0),
        failed: Number(response?.failed ?? 0),
        errors: Array.isArray(response?.errors) ? response.errors : [],
        skipped: Array.isArray(response?.skipped) ? response.skipped : [],
        warnings: Array.isArray(response?.warnings) ? response.warnings : [],
        questionCount: Array.isArray(response?.questions) ? response.questions.length : 0,
      });
      setPreviewState('ready');
    } catch (err) {
      setPreviewState('error');
      setPreviewError(safeAdminErrorMessage(err, 'Preview failed. Check your content and try again.'));
    }
  }

  async function handleImport(event) {
    event.preventDefault();
    setTouched({ course_id: true, content: true, topic: true });
    if (!validateForm()) {
      return;
    }

    setImportState('loading');
    setRequestError('');
    setResult(null);

    const payload = buildImportPayload(form);

    try {
      const response = await adminApi.importAikenQuestions(token, payload);
      const imported = Number(response?.imported ?? 0);
      const verifiedDbCount = Number(response?.verifiedDbCount ?? imported);
      const batchId = response?.batchId ?? null;

      let batchVerifiedCount = verifiedDbCount;
      if (batchId) {
        try {
          const batchResponse = await adminApi.getAikenImportBatch(token, batchId);
          const successItems = Array.isArray(batchResponse?.items)
            ? batchResponse.items.filter((item) => item.status === 'SUCCESS' && item.questionId)
            : [];
          batchVerifiedCount = successItems.length;
        } catch {
          // Fall back to API verifiedDbCount when batch detail is unavailable.
        }
      }

      const persistedCount = Math.min(imported, batchVerifiedCount);

      const outcome = {
        batchId,
        imported: persistedCount,
        skippedDuplicates: Number(response?.skippedDuplicates ?? 0),
        failed: Number(response?.failed ?? 0),
        verifiedDbCount: batchVerifiedCount,
        importedQuestionIds: Array.isArray(response?.importedQuestionIds)
          ? response.importedQuestionIds
          : [],
        errors: Array.isArray(response?.errors) ? response.errors : [],
        skipped: Array.isArray(response?.skipped) ? response.skipped : [],
        warnings: Array.isArray(response?.warnings) ? response.warnings : [],
        apiSuccess: Boolean(response?.success),
      };

      setResult(outcome);

      if (persistedCount > 0 && persistedCount === batchVerifiedCount) {
        setImportState('success');
      } else if (persistedCount > 0) {
        setImportState('partial');
      } else {
        setImportState('error');
        setRequestError(
          outcome.failed > 0 || outcome.skippedDuplicates > 0
            ? 'No questions were saved to the question bank. Review the errors below.'
            : 'No questions were saved to the question bank.'
        );
      }
    } catch (err) {
      setImportState('error');
      setRequestError(safeAdminErrorMessage(err, 'Import request failed. Please try again.'));
    }
  }

  const importHeading =
    importState === 'success'
      ? 'Import complete'
      : importState === 'partial'
        ? 'Import partially complete'
        : 'Import could not be completed';

  return (
    <section className="admin-page">
      <section className="admin-card">
        <div className="admin-row-actions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="heading-3">Import Aiken Questions</h2>
            <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
              Preview your file first, then persist valid questions to the shared question bank.
            </p>
          </div>
        </div>
      </section>

      <form className="admin-card" onSubmit={handleImport} noValidate>
        <h3 className="heading-4">Import settings</h3>

        {coursesError ? (
          <p className="admin-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {coursesError}
          </p>
        ) : null}

        {subjectsError && courseSelected ? (
          <p className="admin-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {safeAdminErrorMessage({ message: subjectsError }, 'Could not load subjects for this course.')}
          </p>
        ) : null}

        <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
          <div className="admin-field">
            <label htmlFor="course_id">
              Course <span aria-hidden="true">*</span>
            </label>
            <select
              id="course_id"
              name="course_id"
              value={form.course_id}
              onChange={handleChange}
              onBlur={handleBlur}
              required
              disabled={fieldsDisabled}
              aria-invalid={showError('course_id')}
              aria-describedby={showError('course_id') ? 'course_id-error' : undefined}
            >
              <option value="">{isLoadingCourses ? 'Loading courses…' : 'Select course'}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title || `Course #${course.id}`}
                </option>
              ))}
            </select>
            {showError('course_id') ? (
              <div id="course_id-error" className="admin-field__error" role="alert">
                {fieldErrors.course_id}
              </div>
            ) : null}
          </div>

          <div className="admin-field">
            <label htmlFor="subject_id">Subject</label>
            <select
              id="subject_id"
              name="subject_id"
              value={form.subject_id}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={fieldsDisabled || !courseSelected || isLoadingSubjects}
            >
              <option value="">
                {!courseSelected
                  ? 'Select a course first'
                  : isLoadingSubjects
                    ? 'Loading subjects…'
                    : 'No subject (optional)'}
              </option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name || subject.title || `Subject #${subject.id}`}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="topic">Topic</label>
            <input
              id="topic"
              name="topic"
              type="text"
              value={form.topic}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={MAX_QUESTION_TOPIC_LENGTH}
              disabled={fieldsDisabled}
              placeholder="Optional topic label"
              aria-invalid={showError('topic')}
              aria-describedby={showError('topic') ? 'topic-error' : undefined}
            />
            {showError('topic') ? (
              <div id="topic-error" className="admin-field__error" role="alert">
                {fieldErrors.topic}
              </div>
            ) : null}
          </div>

          <div className="admin-field">
            <label htmlFor="difficulty">Difficulty</label>
            <select
              id="difficulty"
              name="difficulty"
              value={form.difficulty}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={fieldsDisabled}
            >
              <option value="">Select difficulty (optional)</option>
              {difficultyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor="duplicate_policy">Duplicate policy</label>
            <select
              id="duplicate_policy"
              name="duplicate_policy"
              value={form.duplicate_policy}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={fieldsDisabled}
            >
              <option value="skip">Skip duplicates (recommended)</option>
              <option value="warn">Warn and import anyway</option>
              <option value="allow">Allow all duplicates</option>
            </select>
            <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
              Compares question text, options, and correct answer against this course and the current file.
            </p>
          </div>
        </div>

        <div className="admin-field" style={{ marginTop: 'var(--space-4)' }}>
          <label htmlFor="content">
            Aiken content <span aria-hidden="true">*</span>
          </label>
          <textarea
            id="content"
            name="content"
            value={form.content}
            onChange={handleChange}
            onBlur={handleBlur}
            rows={16}
            disabled={isImporting || isPreviewing}
            placeholder={'Question text here\nA) Option A\nB) Option B\nC) Option C\nD) Option D\nANSWER: B'}
            aria-invalid={showError('content')}
            aria-describedby={showError('content') ? 'content-error' : 'content-help'}
            spellCheck={false}
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}
          />
          <p id="content-help" className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
            Separate multiple questions with a blank line. Supports A) / A: syntax and optional EXPLANATION
            blocks.
          </p>
          {showError('content') ? (
            <div id="content-error" className="admin-field__error" role="alert">
              {fieldErrors.content}
            </div>
          ) : null}
        </div>

        <div className="admin-row-actions" style={{ marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={handlePreview}
            disabled={fieldsDisabled}
            aria-busy={isPreviewing || undefined}
          >
            {isPreviewing ? 'Previewing…' : 'Preview (not saved)'}
          </button>
          <AdminLoadingButton
            type="submit"
            isLoading={isImporting}
            loadingLabel="Saving to question bank…"
            disabled={fieldsDisabled}
          >
            Persist to question bank
          </AdminLoadingButton>
        </div>
      </form>

      {previewState === 'loading' ? (
        <section className="admin-card" aria-live="polite" aria-busy="true">
          <h3 className="heading-4">Preview (not saved)</h3>
          <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
            Checking your file. Nothing is being saved yet.
          </p>
        </section>
      ) : null}

      {previewState === 'error' && previewError ? (
        <section className="admin-card" aria-live="assertive">
          <h3 className="heading-4">Preview failed</h3>
          <p className="admin-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {previewError}
          </p>
        </section>
      ) : null}

      {previewState === 'ready' && previewResult ? (
        <section className="admin-card admin-import-preview" aria-live="polite">
          <h3 className="heading-4">Preview (not saved)</h3>
          <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
            These results are a dry run only. Click <strong>Persist to question bank</strong> to save.
          </p>

          <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
            <div className="admin-stat-card">
              <p className="admin-stat-card__label">Ready to import</p>
              <p className="heading-3" style={{ marginTop: '0.25rem' }}>
                {previewResult.imported}
              </p>
            </div>
            <div className="admin-stat-card">
              <p className="admin-stat-card__label">Would skip</p>
              <p className="heading-3" style={{ marginTop: '0.25rem' }}>
                {previewResult.skippedDuplicates}
              </p>
            </div>
            <div className="admin-stat-card">
              <p className="admin-stat-card__label">Invalid</p>
              <p className="heading-3" style={{ marginTop: '0.25rem' }}>
                {previewResult.failed}
              </p>
            </div>
          </div>

          {previewResult.errors.length > 0 ? (
            <div style={{ marginTop: 'var(--space-4)' }}>
              <h4 className="heading-5">Preview issues</h4>
              <ul className="admin-list" style={{ marginTop: '0.75rem' }}>
                {previewResult.errors.map((entry, index) => {
                  const detail = formatStructuredImportError(entry, index);
                  return (
                    <li key={`preview-${detail.errorCode}-${index}`} style={{ marginBottom: '0.75rem' }}>
                      <strong>{detail.headline}</strong>
                      <div className="admin-stat-card__label" style={{ marginTop: '0.25rem' }}>
                        {detail.message}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {importState === 'loading' ? (
        <section className="admin-card" aria-live="polite" aria-busy="true">
          <h3 className="heading-4">Saving to question bank</h3>
          <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
            Parsing, validating, and saving questions. This may take a moment for large files.
          </p>
        </section>
      ) : null}

      {importState === 'error' && requestError ? (
        <section className="admin-card" aria-live="assertive">
          <h3 className="heading-4">{importHeading}</h3>
          <p className="admin-error" role="alert" style={{ marginTop: '0.75rem' }}>
            {requestError}
          </p>
          {result ? (
            <ImportResultDetails result={result} />
          ) : null}
        </section>
      ) : null}

      {(importState === 'success' || importState === 'partial') && result ? (
        <section className="admin-card" aria-live="polite">
          <h3 className="heading-4">{importHeading}</h3>
          <p className="admin-stat-card__label" style={{ marginTop: '0.5rem' }}>
            {result.imported > 0
              ? `${result.imported} question${result.imported === 1 ? '' : 's'} saved to the question bank. Refreshing this page will not remove them — they are stored in the database.`
              : 'No questions were saved.'}
          </p>
          <ImportResultDetails result={result} />
        </section>
      ) : null}
    </section>
  );
}

function ImportResultDetails({ result }) {
  return (
    <>
      <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <div className="admin-stat-card">
          <p className="admin-stat-card__label">Saved to question bank</p>
          <p className="heading-3" style={{ marginTop: '0.25rem' }}>
            {result.imported}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-card__label">Verified in database</p>
          <p className="heading-3" style={{ marginTop: '0.25rem' }}>
            {result.verifiedDbCount}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-card__label">Skipped duplicates</p>
          <p className="heading-3" style={{ marginTop: '0.25rem' }}>
            {result.skippedDuplicates}
          </p>
        </div>
        <div className="admin-stat-card">
          <p className="admin-stat-card__label">Failed</p>
          <p className="heading-3" style={{ marginTop: '0.25rem' }}>
            {result.failed}
          </p>
        </div>
      </div>

      {result.imported !== result.verifiedDbCount ? (
        <p className="admin-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
          Saved count does not match database verification. Contact support with batch reference{' '}
          {result.batchId ?? '—'}.
        </p>
      ) : null}

      {result.errors.length > 0 ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h4 className="heading-5">Failed questions</h4>
          <ul className="admin-list" style={{ marginTop: '0.75rem' }}>
            {result.errors.map((entry, index) => {
              const detail = formatStructuredImportError(entry, index);
              return (
                <li key={`failed-${detail.errorCode}-${index}`} style={{ marginBottom: '1rem' }}>
                  <strong>{detail.headline}</strong>
                  <div className="admin-stat-card__label" style={{ marginTop: '0.25rem' }}>
                    {detail.message}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {result.skipped?.length > 0 ? (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h4 className="heading-5">Skipped duplicates</h4>
          <ul className="admin-list" style={{ marginTop: '0.75rem' }}>
            {result.skipped.map((entry, index) => {
              const detail = formatStructuredImportError(entry, index);
              return (
                <li key={`skipped-${detail.errorCode}-${index}`} style={{ marginBottom: '1rem' }}>
                  <strong>{detail.headline}</strong>
                  <div className="admin-stat-card__label" style={{ marginTop: '0.25rem' }}>
                    {detail.message}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </>
  );
}
