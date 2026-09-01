import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import DownloadResultsButton from '../components/DownloadResultsButton';
import TestResultsReleasePanel from '../components/TestResultsReleasePanel';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { useDebouncedValue } from '../../components/admin/useDebouncedValue';
import '../../admin/styles/admin-results-redesign.css';

/* ── helpers ─────────────────────────────────────────── */

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds) {
  if (seconds == null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 1) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function chipClass(pct) {
  if (pct == null) return 'rr-chip--neutral';
  if (pct >= 80) return 'rr-chip--high';
  if (pct >= 50) return 'rr-chip--mid';
  return 'rr-chip--low';
}

function stripHtml(html) {
  if (!html) return '';
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent || el.innerText || '';
}

/* ── summary cards ───────────────────────────────────── */

function SummaryCard({ label, value }) {
  return (
    <div className="rr-summary__card">
      <span className="rr-summary__label">{label}</span>
      <span className="rr-summary__value">{value}</span>
    </div>
  );
}

function ScoreHistogram({ buckets }) {
  if (!buckets || !buckets.length) return null;
  const max = Math.max(...buckets, 1);
  const labels = ['0-9','10-19','20-29','30-39','40-49','50-59','60-69','70-79','80-89','90-100'];
  return (
    <div className="rr-histogram">
      <span className="rr-histogram__title">Score distribution</span>
      <div className="rr-histogram__bars">
        {buckets.map((c, i) => (
          <div key={i} className="rr-histogram__col">
            <div className="rr-histogram__bar-wrap">
              <div className="rr-histogram__bar" style={{ height: `${(c / max) * 100}%` }} title={`${labels[i]}%: ${c}`} />
            </div>
            <span className="rr-histogram__bar-label">{labels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── answer grid (table header + cells) ──────────────── */

function AnswerGridHeader({ count }) {
  const cols = [];
  for (let i = 1; i <= count; i++) {
    cols.push(<th key={i} className="rr-tbl__qh" title={`Q${i}`}>{i}</th>);
  }
  return cols;
}

function AnswerGridCells({ grid }) {
  if (!grid || !grid.length) return null;
  return grid.map((v, i) => (
    <td key={i} className="rr-tbl__qc">
      {v === true
        ? <span className="rr-qm rr-qm--ok">✓</span>
        : v === false
          ? <span className="rr-qm rr-qm--no">✗</span>
          : <span className="rr-qm rr-qm--skip">–</span>}
    </td>
  ));
}

/* ── info row (for detail panel) ─────────────────────── */

function InfoRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="rr-info-row">
      <span className="rr-info-row__label">{label}</span>
      <span className="rr-info-row__value">{String(value)}</span>
    </div>
  );
}

/* ── detail panel ────────────────────────────────────── */

function AttemptDetailPanel({ attempt, testId, testTitle, questionIds, onClose }) {
  const token = getAdminToken();
  const [enrollment, setEnrollment] = useState(null);
  const [enrollLoading, setEnrollLoading] = useState(false);
  const [tab, setTab] = useState('attempt');
  const [detail, setDetail] = useState(attempt);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (!attempt?.attempt_id || !testId) {
      setDetail(attempt);
      return undefined;
    }
    let cancel = false;
    setDetailError('');
    adminApi
      .getTestResultAttempt(token, testId, attempt.attempt_id)
      .then((res) => {
        if (!cancel) setDetail({ ...attempt, ...(res?.data ?? {}) });
      })
      .catch((err) => {
        if (!cancel) {
          setDetail(attempt);
          setDetailError(err.message || 'Failed to load question details.');
        }
      });
    return () => {
      cancel = true;
    };
  }, [attempt, testId, token]);

  useEffect(() => {
    if (!attempt?.user_id) { setEnrollment(null); return; }
    let cancel = false;
    setEnrollLoading(true);
    adminApi.enrollments(token, { user_id: attempt.user_id })
      .then((res) => { if (!cancel) setEnrollment((Array.isArray(res?.data) ? res.data : [])[0] ?? null); })
      .catch(() => { if (!cancel) setEnrollment(null); })
      .finally(() => { if (!cancel) setEnrollLoading(false); });
    return () => { cancel = true; };
  }, [attempt?.user_id, token]);

  if (!attempt) return null;

  const details = detail?.answer_details || [];
  const grid = detail?.answer_grid || attempt.answer_grid || [];
  const correctCount = grid.filter((v) => v === true).length;
  const wrongCount = grid.filter((v) => v === false).length;
  const skipCount = grid.filter((v) => v == null).length;

  return (
    <div className="rr-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rr-panel" role="dialog" aria-label={`Details: ${attempt.student_name}`}>
        {/* header */}
        <div className="rr-panel__head">
          <h3 className="rr-panel__title">{attempt.student_name}</h3>
          <button type="button" className="rr-panel__close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* tabs */}
        <div className="rr-tabs">
          {['attempt','student','questions'].map((t) => (
            <button key={t} type="button" className={`rr-tab ${tab === t ? 'rr-tab--on' : ''}`} onClick={() => setTab(t)}>
              {t === 'attempt' ? 'Test Attempt' : t === 'student' ? 'Student Info' : `Questions (${details.filter(Boolean).length})`}
            </button>
          ))}
        </div>

        {/* content */}
        <div className="rr-panel__body">
          {detailError ? <p className="admin-error">{detailError}</p> : null}

          {/* ── Attempt tab ────────────────────────── */}
          {tab === 'attempt' && (
            <div className="rr-section">
              <div className="rr-score-hero">
                <span className={`rr-chip rr-chip--lg ${chipClass(detail.percentage ?? attempt.percentage)}`}>
                  {(detail.percentage ?? attempt.percentage) != null ? `${detail.percentage ?? attempt.percentage}%` : '—'}
                </span>
                <span className="rr-score-frac">
                  {attempt.score != null && attempt.max_score != null ? `${attempt.score} / ${attempt.max_score}` : ''}
                </span>
                <span className="rr-pass-badge">{attempt.pass_status || '—'}</span>
              </div>
              <div className="rr-info-grid">
                <InfoRow label="Test" value={testTitle} />
                <InfoRow label="Student" value={attempt.student_name} />
                <InfoRow label="Email" value={attempt.user_email} />
                <InfoRow label="Started" value={formatDateTime(attempt.started_at)} />
                <InfoRow label="Finished" value={formatDateTime(attempt.submitted_at)} />
                <InfoRow label="Time taken" value={formatDuration(attempt.time_taken_seconds)} />
                <InfoRow label="Correct" value={attempt.correct_answers ?? correctCount} />
                <InfoRow label="Wrong" value={attempt.wrong_answers ?? wrongCount} />
                <InfoRow label="Unanswered" value={attempt.skipped_answers ?? skipCount} />
                <InfoRow label="Total questions" value={attempt.total_questions ?? grid.length} />
              </div>
              <div className="rr-mini-grid">
                <h4 className="rr-mini-grid__title">Answer overview</h4>
                <div className="rr-mini-grid__wrap">
                  {grid.map((v, i) => (
                    <div key={i} className={`rr-mq ${v === true ? 'rr-mq--ok' : v === false ? 'rr-mq--no' : 'rr-mq--skip'}`}>
                      <span className="rr-mq__n">Q{i + 1}</span>
                      <span className="rr-mq__m">{v === true ? '✓' : v === false ? '✗' : '–'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Student tab ────────────────────────── */}
          {tab === 'student' && (
            <div className="rr-section">
              {enrollLoading ? (
                <p className="rr-empty">Loading student details…</p>
              ) : enrollment ? (
                <div className="rr-info-grid">
                  <InfoRow label="Full name" value={enrollment.applicantFullName} />
                  <InfoRow label="Father's name" value={enrollment.fatherName} />
                  <InfoRow label="Email" value={enrollment.email} />
                  <InfoRow label="Account email" value={enrollment.userEmail} />
                  <InfoRow label="WhatsApp" value={enrollment.whatsappNumber} />
                  <InfoRow label="Date of birth" value={enrollment.dateOfBirth ? new Date(enrollment.dateOfBirth).toLocaleDateString() : null} />
                  <InfoRow label="Gender" value={enrollment.gender} />
                  <InfoRow label="Province" value={enrollment.province} />
                  <InfoRow label="District" value={enrollment.district} />
                  <InfoRow label="City" value={enrollment.city} />
                  <InfoRow label="Board" value={enrollment.board} />
                  <InfoRow label="Education level" value={enrollment.hsscStatus} />
                  <InfoRow label="MDCAT attempt type" value={enrollment.mdcatAttemptType} />
                  <InfoRow label="Course" value={enrollment.courseTitle} />
                  <InfoRow label="Enrollment status" value={enrollment.status} />
                  <InfoRow label="Access status" value={enrollment.accessStatus} />
                  <InfoRow label="Enrollment source" value={enrollment.enrollmentSource} />
                  <InfoRow label="Payment status" value={enrollment.orderStatus} />
                  <InfoRow label="Payment gateway" value={enrollment.orderGateway} />
                  <InfoRow label="Account status" value={enrollment.userAccountStatus} />
                  <InfoRow label="Admin note" value={enrollment.adminNote} />
                  <InfoRow label="Enrolled on" value={formatDateTime(enrollment.createdAt)} />
                  <InfoRow label="Reviewed at" value={formatDateTime(enrollment.reviewedAt)} />
                </div>
              ) : (
                <div className="rr-empty">
                  <p>No enrollment record found for this student.</p>
                  {attempt.user_email ? <InfoRow label="Email" value={attempt.user_email} /> : null}
                </div>
              )}
            </div>
          )}

          {/* ── Questions tab ──────────────────────── */}
          {tab === 'questions' && (
            <div className="rr-section rr-qlist">
              {details.length > 0 ? details.map((d, idx) => {
                if (!d) {
                  return (
                    <div key={idx} className="rr-qcard rr-qcard--unanswered">
                      <div className="rr-qcard__head">
                        <span className="rr-qcard__num">Q{idx + 1}</span>
                        <span className="rr-qcard__status rr-qcard__status--unanswered">Unanswered</span>
                      </div>
                      <p className="rr-qcard__text">(No data available for this question)</p>
                    </div>
                  );
                }

                const selectedId = d.selected_option_id;
                const wasAnswered = selectedId != null && selectedId !== '' && Number(selectedId) > 0;
                const status = !wasAnswered ? 'unanswered' : d.is_correct ? 'correct' : 'incorrect';

                return (
                  <div key={d.question_id || idx} className={`rr-qcard rr-qcard--${status}`}>
                    <div className="rr-qcard__head">
                      <span className="rr-qcard__num">Q{idx + 1}</span>
                      <span className={`rr-qcard__status rr-qcard__status--${status}`}>
                        {status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Incorrect' : 'Unanswered'}
                      </span>
                      {d.marks_awarded != null && (
                        <span className="rr-qcard__marks">{d.marks_awarded}/{d.marks} marks</span>
                      )}
                    </div>

                    <p className="rr-qcard__text">{stripHtml(d.question_text) || '(No question text)'}</p>

                    {/* Option list */}
                    <div className="rr-qcard__opts">
                      {d.options && d.options.length > 0 ? d.options.map((opt) => {
                        const isSelected = Number(opt.option_id) === Number(selectedId);
                        const isAnswer = Boolean(opt.is_correct);
                        let cls = 'rr-opt';
                        if (isSelected && isAnswer) cls += ' rr-opt--correct-sel';
                        else if (isSelected && !isAnswer) cls += ' rr-opt--wrong-sel';
                        else if (isAnswer) cls += ' rr-opt--correct';

                        return (
                          <div key={opt.option_id} className={cls}>
                            <span className="rr-opt__key">{opt.option_key || '•'}</span>
                            <span className="rr-opt__text">{stripHtml(opt.option_text) || '(empty)'}</span>
                            {isSelected && <span className="rr-opt__badge rr-opt__badge--sel">Selected</span>}
                            {isAnswer && <span className="rr-opt__badge rr-opt__badge--ans">Correct</span>}
                          </div>
                        );
                      }) : (
                        <>
                          {wasAnswered && d.selected_option_text && (
                            <div className="rr-opt rr-opt--wrong-sel">
                              <span className="rr-opt__key">—</span>
                              <span className="rr-opt__text">{stripHtml(d.selected_option_text)}</span>
                              <span className="rr-opt__badge rr-opt__badge--sel">Selected</span>
                            </div>
                          )}
                          {d.correct_option_text && (
                            <div className="rr-opt rr-opt--correct">
                              <span className="rr-opt__key">—</span>
                              <span className="rr-opt__text">{stripHtml(d.correct_option_text)}</span>
                              <span className="rr-opt__badge rr-opt__badge--ans">Correct</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {d.explanation && (
                      <div className="rr-qcard__explanation">
                        <strong>Explanation:</strong> {stripHtml(d.explanation)}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <p className="rr-empty">No question details available for this attempt.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── main page ───────────────────────────────────────── */

export default function AdminTestResultsPage() {
  const { testId, refreshTest } = useOutletContext();
  const token = getAdminToken();
  const [releasedAt, setReleasedAt] = useState(null);
  const [settingsErr, setSettingsErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [sortKey, setSortKey] = useState('submitted_at');
  const [sortDir, setSortDir] = useState('desc');
  const [selected, setSelected] = useState(null);

  const loadRelease = useCallback(async () => {
    if (!testId) return;
    setSettingsErr('');
    try {
      const r = await adminApi.getTestSettings(token, testId);
      setReleasedAt(r?.data?.results_released_at ?? null);
    } catch (e) { setSettingsErr(e.message || 'Failed to load release status.'); }
  }, [testId, token]);

  const loadResults = useCallback(async () => {
    if (!testId) return;
    setLoading(true); setError('');
    try {
      const r = await adminApi.getTestResults(token, testId, {
        page,
        limit: 25,
        q: debouncedSearch,
        sort: sortKey,
        dir: sortDir,
      });
      setData(r?.data ?? null);
    } catch (e) {
      setError(e.message || 'Failed to load results.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, sortDir, sortKey, testId, token]);

  useEffect(() => { loadRelease(); loadResults(); }, [loadRelease, loadResults]);

  const summary = data?.summary;
  const qIds = data?.question_ids ?? [];
  const attempts = data?.attempts ?? [];
  const testTitle = data?.testTitle ?? '';
  const pagination = data?.pagination ?? { page: 1, limit: 25, total: 0, total_pages: 1 };

  function doSort(key) {
    setPage(1);
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'student_name' ? 'asc' : 'desc'); }
  }

  function SortBtn({ col, label }) {
    const arrow = sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
    return <button type="button" className="rr-tbl__sort" onClick={() => doSort(col)}>{label}{arrow}</button>;
  }

  return (
    <div className="rr-page">
      <div className="rr-page__head">
        <h2 className="rr-page__title">Results</h2>
        <div className="rr-page__actions">
          {testId && <DownloadResultsButton testId={testId} />}
          <button type="button" className="btn btn--ghost btn--sm" onClick={loadResults} disabled={loading}>Refresh</button>
        </div>
      </div>

      <p className="rr-page__lead">View student attempts, export results, and release scores when ready.</p>

      {settingsErr && <p className="admin-error">{settingsErr}</p>}

      {testId && (
        <TestResultsReleasePanel
          testId={testId}
          resultsReleasedAt={releasedAt}
          onChanged={(next) => {
            setReleasedAt(next);
            refreshTest?.();
          }}
        />
      )}

      {error && <p className="admin-error">{error}</p>}

      {loading ? (
        <p className="rr-empty">Loading results…</p>
      ) : !data || (summary?.total_responses ?? 0) === 0 ? (
        <div className="rr-empty"><p>No submitted attempts yet.</p></div>
      ) : (
        <>
          {/* Summary */}
          <div className="rr-summary">
            <SummaryCard label="Average score" value={summary?.average_score != null ? String(summary.average_score) : '—'} />
            <SummaryCard label="Average percentage" value={summary?.average_percentage != null ? `${summary.average_percentage}%` : '—'} />
            <SummaryCard label="Average time" value={formatDuration(summary?.average_time_seconds)} />
            <SummaryCard label="Total responses" value={summary?.total_responses ?? 0} />
            <ScoreHistogram buckets={summary?.score_histogram} />
          </div>

          {/* Search */}
          <div className="rr-search">
            <input
              type="text"
              className="rr-search__input"
              placeholder="Filter by student name…"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
            />
            <span className="rr-search__count">
              {pagination.total} student{pagination.total !== 1 ? 's' : ''}
              {pagination.total_pages > 1 ? ` · page ${pagination.page} of ${pagination.total_pages}` : ''}
            </span>
          </div>

          {/* Table */}
          <div className="rr-tbl-shell">
            <div className="rr-tbl-scroll">
              <table className="rr-tbl">
                <thead>
                  <tr>
                    <th className="rr-tbl__th rr-tbl__th--name rr-tbl__sticky"><SortBtn col="student_name" label="Name" /></th>
                    <th className="rr-tbl__th rr-tbl__th--score"><SortBtn col="percentage" label="Score" /></th>
                    <th className="rr-tbl__th rr-tbl__th--date"><SortBtn col="started_at" label="Started" /></th>
                    <th className="rr-tbl__th rr-tbl__th--date"><SortBtn col="submitted_at" label="Finished" /></th>
                    <th className="rr-tbl__th"><SortBtn col="time_taken_seconds" label="Time" /></th>
                    <AnswerGridHeader count={qIds.length} />
                    <th className="rr-tbl__th rr-tbl__th--act" />
                  </tr>
                </thead>
                <tbody>
                  {attempts.length === 0 ? (
                    <tr>
                      <td className="rr-tbl__td" colSpan={6 + qIds.length}>
                        No students match this search.
                      </td>
                    </tr>
                  ) : (
                    attempts.map((a) => (
                    <tr key={a.attempt_id} className="rr-tbl__row">
                      <td className="rr-tbl__td rr-tbl__td--name rr-tbl__sticky">
                        <button type="button" className="rr-name-btn" onClick={() => setSelected(a)} title="View details">{a.student_name}</button>
                      </td>
                      <td className="rr-tbl__td rr-tbl__td--score">
                        <span className={`rr-chip ${chipClass(a.percentage)}`}>{a.percentage != null ? `${a.percentage}%` : '—'}</span>
                        <span className="rr-frac">{a.score != null && a.max_score != null ? `(${a.score}/${a.max_score})` : ''}</span>
                      </td>
                      <td className="rr-tbl__td rr-tbl__td--date">{formatDateTime(a.started_at)}</td>
                      <td className="rr-tbl__td rr-tbl__td--date">{formatDateTime(a.submitted_at)}</td>
                      <td className="rr-tbl__td rr-tbl__td--time">{formatDuration(a.time_taken_seconds)}</td>
                      <AnswerGridCells grid={a.answer_grid} />
                      <td className="rr-tbl__td rr-tbl__td--act">
                        <button type="button" className="rr-view-btn" onClick={() => setSelected(a)}>View Result</button>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {pagination.total_pages > 1 ? (
            <div className="rr-search" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={page >= pagination.total_pages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}

          {selected && (
            <AttemptDetailPanel
              attempt={selected}
              testId={testId}
              testTitle={testTitle}
              questionIds={qIds}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
