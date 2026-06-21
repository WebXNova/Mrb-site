/** @typedef {'server' | 'local' | 'empty'} QuizDraftMergeSource */

/**
 * A1 hydration priority — server draft row is always authoritative when present.
 *
 * 1. Server draft exists (including empty question list)
 * 2. Valid local backup
 * 3. Empty builder
 *
 * @param {{
 *   hasServerDraft: boolean,
 *   server: { questions: unknown[], savedAt: string|null, version: number|null }|null,
 *   local: { questions: unknown[], savedAt: string|null, serverVersion?: number|null }|null,
 * }} input
 * @returns {{ source: QuizDraftMergeSource, questions: unknown[], savedAt: string|null, serverVersion: number|null }}
 */
export function resolveQuizDraftHydrationSource({ hasServerDraft, server, local }) {
  if (hasServerDraft) {
    const serverQuestions = Array.isArray(server?.questions) ? server.questions : [];
    return {
      source: 'server',
      questions: serverQuestions,
      savedAt: server?.savedAt ?? null,
      serverVersion: server?.version ?? null,
    };
  }

  const localQuestions = Array.isArray(local?.questions) ? local.questions : [];
  if (localQuestions.length > 0) {
    return {
      source: 'local',
      questions: localQuestions,
      savedAt: local?.savedAt ?? null,
      serverVersion: local?.serverVersion ?? null,
    };
  }

  return {
    source: 'empty',
    questions: [],
    savedAt: null,
    serverVersion: null,
  };
}
