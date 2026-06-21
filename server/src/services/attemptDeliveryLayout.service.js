/**
 * G-RT-05 — Per-attempt question/option delivery layout (shuffle persistence).
 *
 * Layout is generated once at attempt creation, stored on test_attempts.delivery_layout_json,
 * and replayed on every load (refresh, resume, reconnect). Answers remain keyed by stable
 * question_bank / question_options IDs — display order never affects grading.
 */

import { loadComposedTestQuestions } from './testQuestionComposition.service.js';

export const DELIVERY_LAYOUT_VERSION = 1;

/**
 * @typedef {object} AttemptDeliveryLayout
 * @property {number} version
 * @property {number[]} questionOrder — question_bank ids
 * @property {Record<string, number[]>} optionOrderByQuestion — questionId → option ids
 * @property {boolean} shuffleQuestions
 * @property {boolean} shuffleOptions
 * @property {number} seed
 */

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isShuffleEnabled(value) {
  return Boolean(Number(value ?? 0));
}

/**
 * Stable 32-bit seed from attempt identity (deterministic per attempt).
 *
 * @param {number} attemptId
 * @param {string|null|undefined} attemptNonce
 */
export function deriveAttemptShuffleSeed(attemptId, attemptNonce) {
  const input = `${Number(attemptId)}:${String(attemptNonce ?? '')}:mrb-delivery-layout-v1`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher–Yates in-place shuffle.
 *
 * @param {number[]} items
 * @param {() => number} random
 */
export function shuffleIdsInPlace(items, random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * @param {Array<{ questionId: number, displayOrder?: number, options?: Array<{ optionId: number, sortOrder?: number }> }>} composedQuestions
 * @param {{ shuffleQuestions?: boolean, shuffleOptions?: boolean, seed: number }} settings
 * @returns {AttemptDeliveryLayout}
 */
export function buildAttemptDeliveryLayout(composedQuestions, settings) {
  const seed = Number(settings.seed) >>> 0;
  const shuffleQuestions = Boolean(settings.shuffleQuestions);
  const shuffleOptions = Boolean(settings.shuffleOptions);

  const sortedQuestions = [...composedQuestions].sort((a, b) => {
    const orderDiff = Number(a.displayOrder ?? 0) - Number(b.displayOrder ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return Number(a.questionId) - Number(b.questionId);
  });

  const questionOrder = sortedQuestions.map((q) => Number(q.questionId));
  if (shuffleQuestions && questionOrder.length > 1) {
    shuffleIdsInPlace(questionOrder, createSeededRandom(seed));
  }

  const optionOrderByQuestion = {};
  for (const question of sortedQuestions) {
    const questionId = Number(question.questionId);
    const sortedOptions = [...(question.options || [])].sort((a, b) => {
      const orderDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(a.optionId) - Number(b.optionId);
    });
    const optionOrder = sortedOptions.map((o) => Number(o.optionId));
    if (shuffleOptions && optionOrder.length > 1) {
      shuffleIdsInPlace(optionOrder, createSeededRandom(seed ^ questionId));
    }
    optionOrderByQuestion[String(questionId)] = optionOrder;
  }

  return {
    version: DELIVERY_LAYOUT_VERSION,
    questionOrder,
    optionOrderByQuestion,
    shuffleQuestions,
    shuffleOptions,
    seed,
  };
}

/**
 * @param {unknown} raw
 * @returns {AttemptDeliveryLayout|null}
 */
export function parseAttemptDeliveryLayout(raw) {
  if (raw == null || raw === '') return null;

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const questionOrder = Array.isArray(parsed.questionOrder)
    ? parsed.questionOrder.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : null;

  if (!questionOrder?.length) return null;

  const optionOrderByQuestion = {};
  const source = parsed.optionOrderByQuestion;
  if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source)) {
      if (!Array.isArray(value)) continue;
      optionOrderByQuestion[String(key)] = value
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
    }
  }

  return {
    version: Number(parsed.version ?? DELIVERY_LAYOUT_VERSION),
    questionOrder,
    optionOrderByQuestion,
    shuffleQuestions: Boolean(parsed.shuffleQuestions),
    shuffleOptions: Boolean(parsed.shuffleOptions),
    seed: Number(parsed.seed ?? 0) >>> 0,
  };
}

/**
 * Reorder composed questions/options for student delivery.
 *
 * @param {Array<Record<string, unknown>>} composedQuestions
 * @param {AttemptDeliveryLayout} layout
 */
export function applyAttemptDeliveryLayout(composedQuestions, layout) {
  const byQuestionId = new Map(
    composedQuestions.map((question) => [Number(question.questionId), question])
  );

  const orderedQuestions = [];
  const seen = new Set();

  for (const questionId of layout.questionOrder) {
    const question = byQuestionId.get(Number(questionId));
    if (!question) continue;
    seen.add(Number(questionId));
    orderedQuestions.push(reorderQuestionOptions(question, layout));
  }

  for (const question of composedQuestions) {
    const questionId = Number(question.questionId);
    if (seen.has(questionId)) continue;
    orderedQuestions.push(reorderQuestionOptions(question, layout));
  }

  return orderedQuestions.map((question, index) => ({
    ...question,
    displayOrder: index,
  }));
}

/**
 * @param {Record<string, unknown>} question
 * @param {AttemptDeliveryLayout} layout
 */
function reorderQuestionOptions(question, layout) {
  const questionId = Number(question.questionId);
  const optionOrder = layout.optionOrderByQuestion[String(questionId)];
  const options = Array.isArray(question.options) ? question.options : [];

  if (!optionOrder?.length) {
    return { ...question, options: [...options] };
  }

  const byOptionId = new Map(options.map((option) => [Number(option.optionId), option]));
  const reordered = [];
  const seen = new Set();

  for (const optionId of optionOrder) {
    const option = byOptionId.get(Number(optionId));
    if (!option) continue;
    seen.add(Number(optionId));
    reordered.push(option);
  }

  for (const option of options) {
    const optionId = Number(option.optionId);
    if (seen.has(optionId)) continue;
    reordered.push(option);
  }

  return { ...question, options: reordered };
}

/**
 * @param {AttemptDeliveryLayout} layout
 */
export function serializeAttemptDeliveryLayout(layout) {
  return JSON.stringify({
    version: layout.version,
    questionOrder: layout.questionOrder,
    optionOrderByQuestion: layout.optionOrderByQuestion,
    shuffleQuestions: layout.shuffleQuestions,
    shuffleOptions: layout.shuffleOptions,
    seed: layout.seed,
  });
}

const PERSIST_LAYOUT_SQL = `
  UPDATE test_attempts
  SET delivery_layout_json = ?
  WHERE id = ?
    AND (delivery_layout_json IS NULL OR delivery_layout_json = '')
`;

const LOAD_LAYOUT_SQL = `
  SELECT delivery_layout_json, attempt_nonce
  FROM test_attempts
  WHERE id = ?
  LIMIT 1
`;

/**
 * Generate and persist layout for a newly created attempt (within transaction).
 *
 * @param {{
 *   attemptId: number,
 *   testId: number,
 *   shuffleQuestions: boolean,
 *   shuffleOptions: boolean,
 *   attemptNonce?: string|null,
 *   connection: import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function initializeAttemptDeliveryLayout(input) {
  const attemptId = Number(input.attemptId);
  const testId = Number(input.testId);
  const connection = input.connection;

  const composed = await loadComposedTestQuestions(testId, {
    audience: 'admin',
    connection,
    logOrphans: false,
  });

  const seed = deriveAttemptShuffleSeed(attemptId, input.attemptNonce);
  const layout = buildAttemptDeliveryLayout(composed, {
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    seed,
  });

  await connection.query(PERSIST_LAYOUT_SQL, [serializeAttemptDeliveryLayout(layout), attemptId]);
  return layout;
}

/**
 * Load persisted layout or lazily backfill legacy attempts (first load only).
 *
 * @param {{
 *   attemptId: number,
 *   testId: number,
 *   shuffleQuestions: boolean,
 *   shuffleOptions: boolean,
 *   deliveryLayoutJson?: unknown,
 *   attemptNonce?: string|null,
 *   composed?: Array<Record<string, unknown>>,
 *   connection?: import('mysql2/promise').PoolConnection,
 *   executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function resolveAttemptDeliveryLayout(input) {
  const attemptId = Number(input.attemptId);
  const testId = Number(input.testId);
  const executor = input.connection ?? input.executor;

  let deliveryLayoutJson = input.deliveryLayoutJson;
  let attemptNonce = input.attemptNonce ?? null;

  if (deliveryLayoutJson == null && executor) {
    const [[row]] = await executor.query(LOAD_LAYOUT_SQL, [attemptId]);
    deliveryLayoutJson = row?.delivery_layout_json;
    attemptNonce = row?.attempt_nonce ?? attemptNonce;
  }

  const existing = parseAttemptDeliveryLayout(deliveryLayoutJson);
  if (existing) {
    return existing;
  }

  const composed =
    input.composed ??
    (await loadComposedTestQuestions(testId, {
      audience: 'admin',
      connection: input.connection ?? input.executor,
      logOrphans: false,
    }));

  const seed = deriveAttemptShuffleSeed(attemptId, attemptNonce);
  const layout = buildAttemptDeliveryLayout(composed, {
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    seed,
  });

  if (executor) {
    await executor.query(PERSIST_LAYOUT_SQL, [serializeAttemptDeliveryLayout(layout), attemptId]);
  }

  return layout;
}

/**
 * Load composed questions with attempt-specific delivery order applied.
 *
 * @param {{
 *   attemptId: number,
 *   testId: number,
 *   shuffleQuestions: boolean,
 *   shuffleOptions: boolean,
 *   deliveryLayoutJson?: unknown,
 *   attemptNonce?: string|null,
 *   audience?: 'admin' | 'student',
 *   connection?: import('mysql2/promise').PoolConnection,
 *   executor?: import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection,
 * }} input
 */
export async function loadComposedQuestionsWithAttemptLayout(input) {
  const audience = input.audience === 'student' ? 'student' : 'admin';
  const composed = await loadComposedTestQuestions(input.testId, {
    audience,
    connection: input.connection ?? input.executor,
    logOrphans: true,
  });

  const layout = await resolveAttemptDeliveryLayout({
    attemptId: input.attemptId,
    testId: input.testId,
    shuffleQuestions: input.shuffleQuestions,
    shuffleOptions: input.shuffleOptions,
    deliveryLayoutJson: input.deliveryLayoutJson,
    attemptNonce: input.attemptNonce,
    composed,
    connection: input.connection,
    executor: input.executor,
  });

  return applyAttemptDeliveryLayout(composed, layout);
}
