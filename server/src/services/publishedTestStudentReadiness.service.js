/**
 * G-10 — post-publish student readiness verification.
 *
 * Pipeline: Draft → Publish → Runtime tables → Student can start attempt.
 */

import { mysqlPool } from '../config/mysql.js';
import { STUDENT_ELIGIBLE_TEST_STATUS } from '../constants/studentEligibleTest.constants.js';

export const LOAD_PUBLISH_READINESS_ROW_SQL = `
  SELECT
    t.id,
    t.status,
    t.deleted_at,
    t.public_slug,
    t.duration_minutes,
    COUNT(DISTINCT tq.id) AS link_count,
    COUNT(DISTINCT CASE WHEN qb.deleted_at IS NULL THEN tq.question_id END) AS active_question_count
  FROM tests t
  LEFT JOIN test_questions tq ON tq.test_id = t.id
  LEFT JOIN question_bank qb ON qb.id = tq.question_id
  WHERE t.id = ?
  GROUP BY t.id, t.status, t.deleted_at, t.public_slug, t.duration_minutes
  LIMIT 1
`;

export const COUNT_MCQ_READY_QUESTIONS_SQL = `
  SELECT COUNT(*) AS ready_count
  FROM test_questions tq
  INNER JOIN question_bank qb ON qb.id = tq.question_id AND qb.deleted_at IS NULL
  WHERE tq.test_id = ?
    AND EXISTS (
      SELECT 1
      FROM question_options qo
      WHERE qo.question_id = tq.question_id
        AND qo.is_correct = 1
    )
    AND (
      SELECT COUNT(*)
      FROM question_options qo2
      WHERE qo2.question_id = tq.question_id
    ) >= 2
`;

/**
 * Pure evaluator — used by E2E harness and unit tests.
 *
 * @param {{
 *   status?: string|null,
 *   deletedAt?: unknown,
 *   publicSlug?: string|null,
 *   linkCount?: number,
 *   activeQuestionCount?: number,
 *   mcqReadyCount?: number,
 *   durationMinutes?: number|null,
 * }} snapshot
 */
export function evaluateStudentReadinessFromSnapshot(snapshot) {
  const status = String(snapshot?.status ?? '').toLowerCase();
  const linkCount = Number(snapshot?.linkCount ?? 0);
  const activeQuestionCount = Number(snapshot?.activeQuestionCount ?? 0);
  const mcqReadyCount = Number(snapshot?.mcqReadyCount ?? 0);
  const durationMinutes = Number(snapshot?.durationMinutes ?? 0);

  /** @type {Array<{ id: string, pass: boolean, detail?: string }>} */
  const checks = [
    {
      id: 'test_published',
      pass: status === STUDENT_ELIGIBLE_TEST_STATUS,
      detail: `status=${snapshot?.status ?? 'missing'}`,
    },
    {
      id: 'test_not_deleted',
      pass: snapshot?.deletedAt == null,
    },
    {
      id: 'public_slug_present',
      pass: Boolean(String(snapshot?.publicSlug ?? '').trim()),
    },
    {
      id: 'runtime_links_present',
      pass: linkCount > 0,
      detail: `linkCount=${linkCount}`,
    },
    {
      id: 'active_question_bank_rows',
      pass: activeQuestionCount > 0 && activeQuestionCount === linkCount,
      detail: `active=${activeQuestionCount}, links=${linkCount}`,
    },
    {
      id: 'mcq_options_ready',
      pass: mcqReadyCount > 0 && mcqReadyCount === activeQuestionCount,
      detail: `mcqReady=${mcqReadyCount}, active=${activeQuestionCount}`,
    },
    {
      id: 'duration_configured',
      pass: Number.isFinite(durationMinutes) && durationMinutes > 0,
      detail: `durationMinutes=${durationMinutes}`,
    },
  ];

  return {
    ready: checks.every((check) => check.pass),
    checks,
    questionCount: activeQuestionCount,
  };
}

/**
 * @param {number} testId
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} [executor]
 */
export async function evaluatePublishedTestStudentReadiness(testId, executor = mysqlPool) {
  const tid = Number(testId);
  const [[row]] = await executor.query(LOAD_PUBLISH_READINESS_ROW_SQL, [tid]);
  if (!row) {
    return {
      ready: false,
      testId: tid,
      checks: [{ id: 'test_exists', pass: false }],
      questionCount: 0,
    };
  }

  const [[mcqRow]] = await executor.query(COUNT_MCQ_READY_QUESTIONS_SQL, [tid]);
  const report = evaluateStudentReadinessFromSnapshot({
    status: row.status,
    deletedAt: row.deleted_at,
    publicSlug: row.public_slug,
    linkCount: Number(row.link_count ?? 0),
    activeQuestionCount: Number(row.active_question_count ?? 0),
    mcqReadyCount: Number(mcqRow?.ready_count ?? 0),
    durationMinutes: row.duration_minutes,
  });

  return {
    testId: tid,
    ...report,
  };
}
