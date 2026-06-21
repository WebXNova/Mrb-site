import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import AdminLoadingButton from '../components/AdminLoadingButton';
import { useAdminToast } from '../context/AdminToastContext';
import '../styles/admin-tests.css';
import '../styles/admin-test-import-wizard.css';

const WIZARD_STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'validation', label: 'Validation' },
  { key: 'preview', label: 'Preview' },
  { key: 'progress', label: 'Import' },
  { key: 'success', label: 'Success' },
];

const ACCEPTED_EXTENSIONS = ['.json', '.csv', '.zip'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_FILE_BYTES = 100 * 1024 * 1024;

function detectFormatFromFileName(fileName) {
  const lower = String(fileName ?? '').toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  return 'auto';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsText(file);
  });
}

function buildImportPayload({ courseId, content, format, fileName }) {
  return {
    course_id: Number(courseId),
    content: String(content),
    format: format === 'auto' ? undefined : format,
    file_name: fileName || null,
  };
}

function ValidationIssueList({ issues }) {
  if (!issues?.length) {
    return (
      <p className="admin-test-import-wizard__progress-text">
        No issues found. The file structure looks valid.
      </p>
    );
  }

  return (
    <ul className="admin-test-import-wizard__issues" aria-label="Validation issues">
      {issues.map((issue, index) => (
        <li
          key={`${issue.code}-${issue.questionIndex ?? 'x'}-${index}`}
          className={`admin-test-import-wizard__issue admin-test-import-wizard__issue--${issue.severity === 'warning' ? 'warning' : 'error'}`}
        >
          <span className="admin-test-import-wizard__issue-code">{issue.code}</span>
          {issue.questionIndex != null ? `Q${issue.questionIndex}: ` : ''}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function PreviewSummary({ preview }) {
  if (!preview) return null;

  const settings = preview.settings ?? {};

  return (
    <>
      <div className="admin-test-import-wizard__summary-grid">
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Title</p>
          <p className="admin-test-import-wizard__summary-value">{preview.title}</p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Questions</p>
          <p className="admin-test-import-wizard__summary-value">{preview.question_count}</p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Duration</p>
          <p className="admin-test-import-wizard__summary-value">
            {preview.duration_minutes != null ? `${preview.duration_minutes} min` : '—'}
          </p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Passing marks</p>
          <p className="admin-test-import-wizard__summary-value">{preview.passing_marks ?? 0}</p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Category</p>
          <p className="admin-test-import-wizard__summary-value">{preview.category ?? '—'}</p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Media bundle</p>
          <p className="admin-test-import-wizard__summary-value">
            {preview.media_bundle ? `Yes (${preview.image_count ?? 0} images)` : 'No'}
          </p>
        </div>
        <div className="admin-test-import-wizard__summary-item">
          <p className="admin-test-import-wizard__summary-label">Access</p>
          <p className="admin-test-import-wizard__summary-value">{settings.access_mode ?? 'private'}</p>
        </div>
      </div>

      {preview.description ? (
        <p className="admin-test-import-wizard__file-meta" style={{ marginBottom: 'var(--space-4)' }}>
          {preview.description}
        </p>
      ) : null}

      {Array.isArray(preview.sample_questions) && preview.sample_questions.length > 0 ? (
        <>
          <h3 className="admin-test-import-wizard__panel-title">Sample questions</h3>
          <ul className="admin-test-import-wizard__sample-list">
            {preview.sample_questions.map((q) => (
              <li key={q.index} className="admin-test-import-wizard__sample-item">
                <strong>Q{q.index}</strong>
                {q.topic ? ` · ${q.topic}` : ''} · {q.marks ?? 1} mark(s) · Answer: {q.correct_answer ?? '—'}
                <div
                  className="admin-test-import-wizard__file-meta"
                  dangerouslySetInnerHTML={{ __html: q.question_html_preview }}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

export default function AdminTestImportWizardPage() {
  const token = getAdminToken();
  const toast = useAdminToast();
  const fileInputRef = useRef(null);

  const [step, setStep] = useState('upload');
  const [courses, setCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState('');

  const [courseId, setCourseId] = useState('');
  const [file, setFile] = useState(null);
  const [content, setContent] = useState('');
  const [format, setFormat] = useState('auto');
  const [uploadError, setUploadError] = useState('');

  const [validateState, setValidateState] = useState('idle');
  const [validationResult, setValidationResult] = useState(null);

  const [previewState, setPreviewState] = useState('idle');
  const [previewResult, setPreviewResult] = useState(null);

  const [importState, setImportState] = useState('idle');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);

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

  const courseTitle = useMemo(() => {
    const id = Number(courseId);
    const match = courses.find((c) => Number(c.id) === id);
    return match?.title ?? (id ? `Course #${id}` : '');
  }, [courses, courseId]);

  function resetDownstream() {
    setValidateState('idle');
    setValidationResult(null);
    setPreviewState('idle');
    setPreviewResult(null);
    setImportState('idle');
    setImportResult(null);
    setImportError('');
  }

  async function handleFileSelect(selectedFile) {
    if (!selectedFile) return;

    setUploadError('');
    resetDownstream();

    const lowerName = selectedFile.name.toLowerCase();
    const hasValidExt = ACCEPTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      setUploadError('Only JSON and CSV files are supported.');
      return;
    }

    if (selectedFile.size > (lowerName.endsWith('.zip') ? MAX_ZIP_FILE_BYTES : MAX_FILE_BYTES)) {
      setUploadError(
        lowerName.endsWith('.zip')
          ? 'ZIP file exceeds the 100 MB import limit.'
          : 'File exceeds the 10 MB import limit.'
      );
      return;
    }

    try {
      const detectedFormat = detectFormatFromFileName(selectedFile.name);
      const text =
        detectedFormat === 'zip' ? await readFileAsBase64(selectedFile) : await readFileAsText(selectedFile);
      if (!text.trim()) {
        setUploadError('The selected file is empty.');
        return;
      }
      setFile(selectedFile);
      setContent(text);
      setFormat(detectedFormat);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read file.');
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) void handleFileSelect(dropped);
  }

  async function runValidation() {
    const cid = Number(courseId);
    if (!Number.isInteger(cid) || cid <= 0) {
      setUploadError('Select a target course before continuing.');
      return;
    }
    if (!content.trim()) {
      setUploadError('Upload a JSON or CSV export file first.');
      return;
    }

    setUploadError('');
    setValidateState('loading');
    setValidationResult(null);
    setStep('validation');

    try {
      const response = await adminApi.validateTestImport(
        token,
        buildImportPayload({ courseId: cid, content, format, fileName: file?.name })
      );
      const data = response?.data ?? response;
      setValidationResult(data);
      setValidateState('ready');
    } catch (err) {
      setValidateState('error');
      setValidationResult({
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'VALIDATION_REQUEST_FAILED',
            message: safeAdminErrorMessage(err, 'Validation request failed.'),
          },
        ],
      });
    }
  }

  async function runPreview() {
    if (!validationResult?.valid) return;

    setPreviewState('loading');
    setPreviewResult(null);
    setStep('preview');

    try {
      const response = await adminApi.previewTestImport(
        token,
        buildImportPayload({
          courseId: Number(courseId),
          content,
          format: validationResult.format ?? format,
          fileName: file?.name,
        })
      );
      const data = response?.data ?? response;
      setPreviewResult(data);
      setPreviewState(data?.valid ? 'ready' : 'error');
    } catch (err) {
      setPreviewState('error');
      setPreviewResult({
        valid: false,
        issues: [
          {
            severity: 'error',
            code: 'PREVIEW_REQUEST_FAILED',
            message: safeAdminErrorMessage(err, 'Preview request failed.'),
          },
        ],
      });
    }
  }

  async function runImport() {
    if (!previewResult?.valid) return;

    setImportState('loading');
    setImportError('');
    setImportResult(null);
    setStep('progress');

    try {
      const response = await adminApi.confirmTestImport(
        token,
        buildImportPayload({
          courseId: Number(courseId),
          content,
          format: previewResult.format ?? validationResult?.format ?? format,
          fileName: file?.name,
        })
      );
      const data = response?.data ?? response;
      setImportResult(data);
      setImportState('ready');
      setStep('success');
      toast.success('Test imported successfully.');
    } catch (err) {
      setImportState('error');
      setImportError(safeAdminErrorMessage(err, 'Import failed. No changes were saved.'));
      toast.error(safeAdminErrorMessage(err, 'Import failed.'));
    }
  }

  const isBusy =
    validateState === 'loading' || previewState === 'loading' || importState === 'loading';

  return (
    <section className="admin-page admin-page--tests">
      <Link className="admin-test-import-wizard__back-link" to={adminRoute('tests')}>
        <ArrowBackIcon fontSize="inherit" aria-hidden />
        Back to tests
      </Link>

      <div className="admin-test-import-wizard">
        <header className="admin-test-import-wizard__header">
          <h1 className="admin-test-import-wizard__title">Import test</h1>
          <p className="admin-test-import-wizard__subtitle">
            Upload a JSON or CSV export file. The wizard validates structure, shows a preview, then
            creates the test in a single atomic transaction.
          </p>
        </header>

        <ol className="admin-test-import-wizard__steps" aria-label="Import wizard progress">
          {WIZARD_STEPS.map((wizardStep, index) => {
            const done = index < stepIndex;
            const current = wizardStep.key === step;
            return (
              <li
                key={wizardStep.key}
                className={`admin-test-import-wizard__step${current ? ' admin-test-import-wizard__step--current' : ''}${done ? ' admin-test-import-wizard__step--done' : ''}`}
                aria-current={current ? 'step' : undefined}
              >
                <span className="admin-test-import-wizard__step-index" aria-hidden>
                  {done ? '✓' : index + 1}
                </span>
                {wizardStep.label}
              </li>
            );
          })}
        </ol>

        {step === 'upload' ? (
          <div className="admin-test-import-wizard__panel">
            <h2 className="admin-test-import-wizard__panel-title">1. Upload file</h2>

            <div className="admin-form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="admin-form-label" htmlFor="import-course">
                Target course
              </label>
              <select
                id="import-course"
                className="admin-form-control"
                value={courseId}
                disabled={isBusy || isLoadingCourses || Boolean(coursesError)}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  resetDownstream();
                }}
              >
                <option value="">Select course…</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title || `Course #${course.id}`}
                  </option>
                ))}
              </select>
              {coursesError ? (
                <p className="admin-form-error" role="alert">
                  {coursesError}
                </p>
              ) : null}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv,.zip,application/json,text/csv,application/zip"
              hidden
              onChange={(event) => {
                void handleFileSelect(event.target.files?.[0] ?? null);
                event.target.value = '';
              }}
            />

            <div
              className={`admin-test-import-wizard__dropzone${file ? ' admin-test-import-wizard__dropzone--has-file' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <CloudUploadIcon aria-hidden style={{ fontSize: 40, opacity: 0.6 }} />
              <p style={{ margin: 0, fontWeight: 500 }}>
                {file ? file.name : 'Drop a file here or click to browse'}
              </p>
              <p className="admin-test-import-wizard__file-meta">
                Supported: JSON v1.0, CSV v1.0, or ZIP bundle (test.json + images/) · Max 10 MB (100 MB for ZIP)
              </p>
            </div>

            {uploadError ? (
              <p className="admin-form-error" role="alert" style={{ marginTop: 'var(--space-3)' }}>
                {uploadError}
              </p>
            ) : null}

            {file ? (
              <p className="admin-test-import-wizard__file-meta">
                Detected format: {(format === 'auto' ? 'auto-detect' : format.toUpperCase())} ·{' '}
                {(file.size / 1024).toFixed(1)} KB
              </p>
            ) : null}

            <div className="admin-test-import-wizard__actions">
              <AdminLoadingButton
                isLoading={validateState === 'loading'}
                loadingLabel="Validating…"
                disabled={!courseId || !content || isBusy}
                onClick={() => void runValidation()}
              >
                Validate &amp; continue
              </AdminLoadingButton>
            </div>
          </div>
        ) : null}

        {step === 'validation' ? (
          <div className="admin-test-import-wizard__panel">
            <h2 className="admin-test-import-wizard__panel-title">2. Validation results</h2>

            {validateState === 'loading' ? (
              <div className="admin-test-import-wizard__progress" aria-busy="true">
                <span className="admin-spinner" aria-hidden />
                <p className="admin-test-import-wizard__progress-text">Checking file structure…</p>
              </div>
            ) : (
              <>
                <div
                  className="admin-test-import-wizard__success-banner"
                  style={
                    validationResult?.valid
                      ? undefined
                      : { background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }
                  }
                >
                  {validationResult?.valid ? (
                    <>
                      <CheckCircleIcon fontSize="small" style={{ verticalAlign: -3, marginRight: 6 }} />
                      File passed validation
                    </>
                  ) : (
                    <>
                      <ErrorIcon fontSize="small" style={{ verticalAlign: -3, marginRight: 6 }} />
                      Validation failed — fix the issues below before importing
                    </>
                  )}
                </div>

                {validationResult?.summary ? (
                  <div className="admin-test-import-wizard__summary-grid" style={{ marginTop: 'var(--space-4)' }}>
                    <div className="admin-test-import-wizard__summary-item">
                      <p className="admin-test-import-wizard__summary-label">Format</p>
                      <p className="admin-test-import-wizard__summary-value">
                        {(validationResult.format ?? format).toUpperCase()}
                      </p>
                    </div>
                    <div className="admin-test-import-wizard__summary-item">
                      <p className="admin-test-import-wizard__summary-label">Questions</p>
                      <p className="admin-test-import-wizard__summary-value">
                        {validationResult.summary.question_count ?? '—'}
                      </p>
                    </div>
                    <div className="admin-test-import-wizard__summary-item">
                      <p className="admin-test-import-wizard__summary-label">Errors</p>
                      <p className="admin-test-import-wizard__summary-value">
                        {validationResult.summary.error_count ?? validationResult.issues?.filter((i) => i.severity === 'error').length ?? 0}
                      </p>
                    </div>
                  </div>
                ) : null}

                <ValidationIssueList issues={validationResult?.issues} />

                <div className="admin-test-import-wizard__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={isBusy}
                    onClick={() => setStep('upload')}
                  >
                    Back
                  </button>
                  <AdminLoadingButton
                    isLoading={previewState === 'loading'}
                    loadingLabel="Loading preview…"
                    disabled={!validationResult?.valid || isBusy}
                    onClick={() => void runPreview()}
                  >
                    Continue to preview
                  </AdminLoadingButton>
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 'preview' ? (
          <div className="admin-test-import-wizard__panel">
            <h2 className="admin-test-import-wizard__panel-title">3. Preview summary</h2>

            {previewState === 'loading' ? (
              <div className="admin-test-import-wizard__progress" aria-busy="true">
                <span className="admin-spinner" aria-hidden />
                <p className="admin-test-import-wizard__progress-text">Building preview…</p>
              </div>
            ) : previewResult?.valid ? (
              <>
                <p className="admin-test-import-wizard__file-meta" style={{ marginBottom: 'var(--space-4)' }}>
                  Importing into <strong>{courseTitle}</strong> as a new draft test.
                </p>
                <PreviewSummary preview={previewResult.preview} />

                <div className="admin-test-import-wizard__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={isBusy}
                    onClick={() => setStep('validation')}
                  >
                    Back
                  </button>
                  <AdminLoadingButton
                    isLoading={importState === 'loading'}
                    loadingLabel="Importing…"
                    disabled={isBusy}
                    onClick={() => void runImport()}
                  >
                    Confirm import
                  </AdminLoadingButton>
                </div>
              </>
            ) : (
              <>
                <ValidationIssueList issues={previewResult?.issues} />
                <div className="admin-test-import-wizard__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={isBusy}
                    onClick={() => setStep('validation')}
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        {step === 'progress' ? (
          <div className="admin-test-import-wizard__panel">
            <h2 className="admin-test-import-wizard__panel-title">4. Import progress</h2>

            {importState === 'loading' ? (
              <div className="admin-test-import-wizard__progress" aria-busy="true">
                <span className="admin-spinner" aria-hidden />
                <p className="admin-test-import-wizard__progress-text">
                  Creating test and questions in a database transaction…
                </p>
                <p className="admin-test-import-wizard__file-meta">
                  Do not close this page until the import completes.
                </p>
              </div>
            ) : importState === 'error' ? (
              <>
                <div
                  className="admin-test-import-wizard__success-banner"
                  style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}
                >
                  <h3>Import failed</h3>
                  <p>{importError || 'The import was rolled back. No test was created.'}</p>
                </div>
                <div className="admin-test-import-wizard__actions">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => setStep('preview')}
                  >
                    Back to preview
                  </button>
                  <button type="button" className="btn btn--secondary" onClick={() => setStep('upload')}>
                    Start over
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {step === 'success' && importResult ? (
          <div className="admin-test-import-wizard__panel">
            <h2 className="admin-test-import-wizard__panel-title">5. Success report</h2>

            <div className="admin-test-import-wizard__success">
              <div className="admin-test-import-wizard__success-banner">
                <h3>Import completed</h3>
                <p>
                  Created test &ldquo;{importResult.report?.title ?? importResult.test?.title ?? 'Untitled'}&rdquo; with{' '}
                  {importResult.question_count ?? importResult.report?.imported_questions ?? 0} questions.
                </p>
              </div>

              <div className="admin-test-import-wizard__summary-grid">
                <div className="admin-test-import-wizard__summary-item">
                  <p className="admin-test-import-wizard__summary-label">Test ID</p>
                  <p className="admin-test-import-wizard__summary-value">{importResult.test_id}</p>
                </div>
                <div className="admin-test-import-wizard__summary-item">
                  <p className="admin-test-import-wizard__summary-label">Batch ID</p>
                  <p className="admin-test-import-wizard__summary-value">{importResult.batch_id}</p>
                </div>
                <div className="admin-test-import-wizard__summary-item">
                  <p className="admin-test-import-wizard__summary-label">Format</p>
                  <p className="admin-test-import-wizard__summary-value">
                    {(importResult.format ?? format).toUpperCase()}
                  </p>
                </div>
                <div className="admin-test-import-wizard__summary-item">
                  <p className="admin-test-import-wizard__summary-label">Status</p>
                  <p className="admin-test-import-wizard__summary-value">
                    {importResult.report?.status ?? 'COMPLETED'}
                  </p>
                </div>
              </div>

              <div className="admin-test-import-wizard__actions">
                <Link
                  className="btn btn--primary admin-touch-target"
                  to={adminRoute(`tests/${importResult.test_id}/setup`)}
                >
                  Open test setup
                </Link>
                <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests')}>
                  Back to test list
                </Link>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setStep('upload');
                    setFile(null);
                    setContent('');
                    setFormat('auto');
                    resetDownstream();
                  }}
                >
                  Import another
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
