/**
 * Student-facing standalone My Results presentation — no database imports.
 * Default "all" is completed attempts only. In-progress is an explicit recovery filter.
 */

import { redactStudentResultListItem } from './testResultVisibility.service.js';
import {
  TEST_ACCESS_TYPE_FREE_STANDALONE,
  TEST_ACCESS_TYPE_PAID_STANDALONE,
} from '../constants/testAccessType.constants.js';

export const DEFAULT_MY_TESTS_PAGE_SIZE = 10;
export const MAX_MY_TESTS_PAGE_SIZE = 50;

export const ACCESS_TYPE_FILTERS = {
  free: TEST_ACCESS_TYPE_FREE_STANDALONE,
  paid: TEST_ACCESS_TYPE_PAID_STANDALONE,
};

const STATUS_FILTERS = new Set(['all', 'completed', 'published', 'in_progress', 'pending', 'blocked']);

export function clampPageSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MY_TESTS_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_MY_TESTS_PAGE_SIZE);
}

export function normalizeAccessTypeFilter(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (raw === 'free' || raw === 'paid') return raw;
  return 'all';
}

export function normalizeStatusFilter(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (STATUS_FILTERS.has(raw)) return raw;
  return 'all';
}

export function normalizeSearchTerm(value) {
  return String(value || '').trim().slice(0, 120);
}

/**
 * Student-facing result state. Scores stay withheld until the server says they are visible.
 *
 * @param {{
 *   attemptStatus: string,
 *   completionReason?: string|null,
 *   integrityBlocked?: boolean,
 *   flagged?: boolean,
 *   resultAvailable?: boolean,
 * }} input
 */
export function deriveStandaloneAttemptState(input) {
  const attemptStatus = String(input.attemptStatus || '').trim().toLowerCase();
  const reason = String(input.completionReason || '').trim().toLowerCase();
  const integrityBlocked = Boolean(input.integrityBlocked);
  const flagged = Boolean(input.flagged);

  if (integrityBlocked || flagged || reason === 'integrity' || reason === 'exam_integrity') {
    return 'blocked';
  }
  if (attemptStatus === 'in_progress') return 'in_progress';
  if (attemptStatus === 'submitted' || attemptStatus === 'expired') {
    return input.resultAvailable ? 'published' : 'pending';
  }
  return 'pending';
}

export function mapStandaloneMyTestItem(row, presentationByTestId = new Map()) {
  const presentation = presentationByTestId.get(Number(row.test_id));
  const redacted = redactStudentResultListItem({
    results_released_at: row.results_released_at,
    show_result_immediately: row.show_result_immediately,
    score: row.score,
    max_score: row.max_score,
    percentage: row.percentage,
    pass_status: row.pass_status,
  });
  const state = deriveStandaloneAttemptState({
    attemptStatus: row.attempt_status,
    completionReason: row.completion_reason,
    integrityBlocked: Boolean(row.integrity_blocked_at),
    flagged: Boolean(Number(row.is_flagged_cheating)),
    resultAvailable: redacted.resultAvailable,
  });
  const resultPublished = state === 'published';
  const rawTime = Number(row.result_time_taken_seconds ?? row.attempt_time_taken_seconds ?? 0);
  const timeTakenSeconds = resultPublished ? rawTime : null;
  const presentationCta = statusPresentation(state);

  return {
    attemptId: Number(row.attempt_id),
    testTitle: String(row.test_title ?? ''),
    subjectLabel: presentation?.displayLabel ?? null,
    slug: row.public_slug ?? null,
    accessType: String(row.test_access_type || ''),
    attemptedAt: row.submitted_at
      ? String(row.submitted_at)
      : row.started_at
        ? String(row.started_at)
        : null,
    state,
    statusLabel: presentationCta.statusLabel,
    ctaLabel: presentationCta.ctaLabel,
    resultAvailable: resultPublished,
    score: resultPublished ? redacted.score : null,
    maxScore: resultPublished ? redacted.maxScore : null,
    percentage: resultPublished ? redacted.percentage : null,
    correctCount: resultPublished && row.correct_count != null ? Number(row.correct_count) : null,
    incorrectCount: resultPublished && row.wrong_count != null ? Number(row.wrong_count) : null,
    timeTakenSeconds,
    passStatus: resultPublished ? redacted.status : null,
  };
}

export function statusPresentation(state) {
  if (state === 'published') {
    return { statusLabel: 'Result Published', ctaLabel: 'View Details' };
  }
  if (state === 'pending') {
    return { statusLabel: 'Results Pending', ctaLabel: 'View Status' };
  }
  if (state === 'in_progress') {
    return { statusLabel: 'In Progress', ctaLabel: 'Continue Test' };
  }
  return { statusLabel: 'Closed', ctaLabel: null };
}

export function buildStandaloneMyTestsFilterClauses({ search, accessType, status }) {
  const clauses = [];
  const params = [];

  if (accessType !== 'all') {
    clauses.push('t.test_access_type = ?');
    params.push(ACCESS_TYPE_FILTERS[accessType]);
  }

  const term = normalizeSearchTerm(search);
  if (term) {
    clauses.push(`(
      t.title LIKE ?
      OR EXISTS (
        SELECT 1
        FROM test_subjects ts
        INNER JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.test_id = t.id AND s.title LIKE ?
      )
    )`);
    params.push(`%${term}%`, `%${term}%`);
  }

  if (status === 'in_progress') {
    clauses.push(`a.status = 'in_progress'`);
    clauses.push(`tib.blocked_at IS NULL`);
    clauses.push(`a.is_flagged_cheating = 0`);
  } else if (status === 'blocked') {
    clauses.push(`(
      tib.blocked_at IS NOT NULL
      OR a.is_flagged_cheating = 1
      OR LOWER(COALESCE(a.completion_reason, '')) IN ('integrity', 'exam_integrity')
    )`);
  } else if (status === 'completed' || status === 'published') {
    clauses.push(`a.status IN ('submitted', 'expired')`);
    clauses.push(`(t.results_released_at IS NOT NULL OR t.show_result_immediately = 1)`);
    clauses.push(`tib.blocked_at IS NULL`);
  } else if (status === 'pending') {
    clauses.push(`a.status IN ('submitted', 'expired')`);
    clauses.push(`NOT (t.results_released_at IS NOT NULL OR t.show_result_immediately = 1)`);
    clauses.push(`tib.blocked_at IS NULL`);
  } else {
    // Default My Results list: completed attempts only. In-progress is a recovery filter.
    clauses.push(`a.status IN ('submitted', 'expired')`);
  }

  const extraWhere = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  return { extraWhere, params };
}
