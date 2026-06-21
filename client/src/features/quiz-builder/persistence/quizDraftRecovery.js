import { resolveQuizDraftHydrationSource } from './quizDraftMerge.js';

/** @typedef {'server' | 'local' | 'local_unsynced' | 'empty'} QuizDraftRecoverySource */

/** @typedef {'none' | 'network' | 'invalid_server' | 'session' | 'corrupt_local' | 'no_draft'} QuizDraftFallbackReason */

/**
 * @typedef {object} QuizDraftRecoveryResult
 * @property {QuizDraftRecoverySource} source
 * @property {unknown[]} questions
 * @property {string|null} savedAt
 * @property {number|null} serverVersion
 * @property {QuizDraftFallbackReason} fallbackReason
 * @property {boolean} needsSync
 * @property {boolean} markDirty
 * @property {string|null} diagnosticMessage
 */

/**
 * @param {unknown[]} questions
 */
function fingerprintQuestions(questions) {
  try {
    return JSON.stringify(questions);
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   syncState?: string|null,
 *   savedAt?: string|null,
 *   serverVersion?: number|null,
 *   questions?: unknown[],
 * }} local
 * @param {{
 *   version?: number|null,
 *   savedAt?: string|null,
 *   lastModified?: string|null,
 *   questions?: unknown[],
 * }} server
 */
export function detectUnsyncedLocalBackup(local, server) {
  if (!local?.questions?.length) {
    return { unsynced: false, reason: null };
  }

  if (local.syncState === 'synced') {
    return { unsynced: false, reason: null };
  }

  if (local.syncState === 'pending') {
    if (!server) {
      return { unsynced: true, reason: 'pending_no_server' };
    }
    const serverVersion = server.version == null ? null : Number(server.version);
    const localVersion = local.serverVersion == null ? null : Number(local.serverVersion);

    if (localVersion != null && serverVersion != null && localVersion < serverVersion) {
      return { unsynced: false, reason: 'stale_local_version' };
    }

    if (localVersion == null || localVersion === serverVersion) {
      return { unsynced: true, reason: 'pending_same_version' };
    }
  }

  if (server && local.savedAt) {
    const localTime = Date.parse(local.savedAt);
    const serverTime = Date.parse(server.savedAt || server.lastModified || '');
    const localVersion = local.serverVersion == null ? null : Number(local.serverVersion);
    const serverVersion = server.version == null ? null : Number(server.version);

    if (
      Number.isFinite(localTime) &&
      Number.isFinite(serverTime) &&
      localTime > serverTime &&
      localVersion === serverVersion
    ) {
      const localFp = fingerprintQuestions(local.questions);
      const serverFp = fingerprintQuestions(server.questions);
      if (localFp && serverFp && localFp !== serverFp) {
        return { unsynced: true, reason: 'legacy_newer_local' };
      }
    }
  }

  return { unsynced: false, reason: null };
}

/**
 * A4 — Production recovery resolver.
 *
 * Priority:
 * 1. Server draft (authoritative when synced)
 * 2. Unsynced local backup (failed sync / crash / offline — same version)
 * 3. Local backup (server unavailable or no server draft)
 * 4. Empty builder
 *
 * @param {{
 *   hasServerDraft: boolean,
 *   server: {
 *     questions: unknown[],
 *     savedAt: string|null,
 *     version: number|null,
 *     lastModified?: string|null,
 *   }|null,
 *   local: {
 *     questions: unknown[],
 *     savedAt: string|null,
 *     serverVersion?: number|null,
 *     syncState?: string|null,
 *   }|null,
 *   serverUnavailable?: boolean,
 *   fallbackReason?: QuizDraftFallbackReason,
 * }} input
 * @returns {QuizDraftRecoveryResult}
 */
export function resolveQuizDraftRecovery({
  hasServerDraft,
  server,
  local,
  serverUnavailable = false,
  fallbackReason = 'none',
}) {
  const localQuestions = Array.isArray(local?.questions) ? local.questions : [];

  if (serverUnavailable || !hasServerDraft) {
    if (localQuestions.length > 0) {
      return {
        source: 'local',
        questions: localQuestions,
        savedAt: local?.savedAt ?? null,
        serverVersion: local?.serverVersion ?? null,
        fallbackReason: fallbackReason === 'none' ? (serverUnavailable ? 'network' : 'no_draft') : fallbackReason,
        needsSync: local?.syncState === 'pending' || !hasServerDraft,
        markDirty: local?.syncState === 'pending' || !hasServerDraft,
        diagnosticMessage: serverUnavailable
          ? 'Server unreachable — restored from browser backup.'
          : 'No server draft — restored from browser backup.',
      };
    }

    return {
      source: 'empty',
      questions: [],
      savedAt: null,
      serverVersion: null,
      fallbackReason: fallbackReason === 'none' ? (serverUnavailable ? 'network' : 'no_draft') : fallbackReason,
      needsSync: false,
      markDirty: false,
      diagnosticMessage: serverUnavailable
        ? 'Server unreachable and no local backup found.'
        : null,
    };
  }

  const unsynced = detectUnsyncedLocalBackup(local, {
    version: server?.version ?? null,
    savedAt: server?.savedAt ?? null,
    lastModified: server?.lastModified ?? null,
    questions: server?.questions ?? [],
  });

  if (unsynced.unsynced && localQuestions.length > 0) {
    return {
      source: 'local_unsynced',
      questions: localQuestions,
      savedAt: local?.savedAt ?? null,
      serverVersion: local?.serverVersion ?? server?.version ?? null,
      fallbackReason: 'none',
      needsSync: true,
      markDirty: true,
      diagnosticMessage: 'Recovered unsynced edits from browser backup.',
    };
  }

  const merged = resolveQuizDraftHydrationSource({
    hasServerDraft: true,
    server,
    local,
  });

  return {
    source: 'server',
    questions: merged.questions,
    savedAt: merged.savedAt,
    serverVersion: merged.serverVersion,
    fallbackReason: 'none',
    needsSync: false,
    markDirty: false,
    diagnosticMessage: null,
  };
}

/**
 * @param {QuizDraftRecoveryResult} recovery
 */
export function formatRecoveryBannerMessage(recovery) {
  if (recovery.source === 'local_unsynced') {
    return 'Recovered unsaved edits from your browser. Syncing to server…';
  }

  if (recovery.fallbackReason === 'network') {
    return 'Could not reach the server. Restored your work from browser backup.';
  }

  if (recovery.fallbackReason === 'invalid_server') {
    return 'Server draft was invalid. Restored from browser backup.';
  }

  if (recovery.fallbackReason === 'session') {
    return 'Sign in to load the server draft. Showing browser backup.';
  }

  if (recovery.fallbackReason === 'corrupt_local') {
    return 'Browser backup was corrupt. Loaded from server.';
  }

  if (recovery.needsSync && recovery.source === 'local') {
    return 'Restored from browser backup. Will sync when online.';
  }

  return recovery.diagnosticMessage;
}
