import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../../api/adminApi.js';
import { getAdminToken } from '../../../auth/session.js';
import { buildQuizDraftPayload } from '../persistence/quizDraftPayload.js';
import {
  classifyServerSaveError,
  fingerprintDraftPayload,
  MAX_SERVER_SAVE_RETRIES,
  serverSaveRetryDelayMs,
} from '../persistence/quizDraftServerSave.js';
import {
  QUIZ_DRAFT_DEBOUNCE_MS,
  readLocalDraftRecord,
  readQuizDraftSavedAt,
  writeQuizDraft,
} from '../persistence/quizDraftStorage.js';
import {
  extractVersionConflictDetails,
  formatConflictMessage,
} from '../persistence/quizDraftConflict.js';
import { formatServerSaveValidationMessage } from '../persistence/quizDraftValidationErrors.js';
import { logQuizDraftSync } from '../persistence/quizDraftTelemetry.js';
import {
  filterPersistableQuizDraftQuestions,
  primaryClientValidationMessage,
  validateQuizDraftQuestionsClient,
} from '../validation/quizMcqClientValidation.js';

export const QUIZ_DRAFT_SERVER_DEBOUNCE_MS = 2000;

/** @typedef {{ ok: true, savedAt: string } | { ok: false, error: string, offline?: boolean }} DraftPersistResult */

/**
 * @param {{
 *   localTimerRef: React.MutableRefObject<number|null>,
 *   serverTimerRef: React.MutableRefObject<number|null>,
 * }}
 */
function clearPendingSaveTimers({ localTimerRef, serverTimerRef }) {
  if (localTimerRef.current) {
    window.clearTimeout(localTimerRef.current);
    localTimerRef.current = null;
  }
  if (serverTimerRef.current) {
    window.clearTimeout(serverTimerRef.current);
    serverTimerRef.current = null;
  }
}

/** @typedef {'saved' | 'saving' | 'unsaved' | 'error' | 'offline'} QuizDraftStatus */

/**
 * A2 — Local backup + debounced server PUT sync.
 *
 * Flow: edit → local backup (fast) → debounced PUT → DB → confirm (reset dirty).
 *
 * @param {{
 *   storageKey: string,
 *   testId?: string | null,
 *   state: import('../types/quizBuilder.types.js').QuizBuilderState,
 *   totalPoints: number,
 *   onSaved: () => void,
 *   readOnly?: boolean,
 *   syncEnabled?: boolean,
 *   serverVersion: number|null,
 *   onServerVersion: (version: number|null) => void,
 *   onServerSaved?: () => void,
 *   needsServerSync?: boolean,
 *   publishedEditEnabled?: boolean,
 *   publishedEditUpdatedAt?: string|null,
 * }} options
 */
export function useQuizDraftPersistence({
  storageKey,
  testId,
  state,
  totalPoints,
  onSaved,
  readOnly,
  syncEnabled = true,
  serverVersion,
  onServerVersion,
  onServerSaved,
  needsServerSync = false,
  publishedEditEnabled = false,
  publishedEditUpdatedAt = null,
}) {
  const [status, setStatus] = useState(/** @type {QuizDraftStatus} */ ('saved'));
  const [lastSavedAt, setLastSavedAt] = useState(() => readQuizDraftSavedAt(storageKey));
  const [saveError, setSaveError] = useState('');

  const stateRef = useRef(state);
  const totalPointsRef = useRef(totalPoints);
  const storageKeyRef = useRef(storageKey);
  const testIdRef = useRef(testId);
  const onSavedRef = useRef(onSaved);
  const onServerSavedRef = useRef(onServerSaved);
  const onServerVersionRef = useRef(onServerVersion);
  const serverVersionRef = useRef(serverVersion);
  const publishedEditEnabledRef = useRef(publishedEditEnabled);
  const publishedEditUpdatedAtRef = useRef(publishedEditUpdatedAt);
  const localTimerRef = useRef(null);
  const serverTimerRef = useRef(null);
  const serverInFlightRef = useRef(false);
  const pendingServerSyncRef = useRef(false);
  const initialPushDoneRef = useRef(false);
  const lastSyncedFingerprintRef = useRef(/** @type {string|null} */ (null));
  const abortRef = useRef(/** @type {AbortController|null} */ (null));

  stateRef.current = state;
  totalPointsRef.current = totalPoints;
  storageKeyRef.current = storageKey;
  testIdRef.current = testId;
  onSavedRef.current = onSaved;
  onServerSavedRef.current = onServerSaved;
  onServerVersionRef.current = onServerVersion;
  serverVersionRef.current = serverVersion;
  publishedEditEnabledRef.current = publishedEditEnabled;
  publishedEditUpdatedAtRef.current = publishedEditUpdatedAt;

  useEffect(() => {
    initialPushDoneRef.current = false;
    lastSyncedFingerprintRef.current = null;
  }, [storageKey, testId]);

  useEffect(() => {
    if (state.isDirty) {
      setSaveError('');
    }
  }, [state.isDirty, state.questions]);

  /** Local backup only — does NOT clear dirty state. */
  const persistLocalBackup = useCallback(() => {
    const current = stateRef.current;
    try {
      const savedAt = writeQuizDraft({
        storageKey: storageKeyRef.current,
        testId: testIdRef.current,
        questions: current.questions,
        totalPoints: totalPointsRef.current,
        serverVersion: serverVersionRef.current,
        syncState: 'pending',
      });
      setLastSavedAt(savedAt);
      return true;
    } catch (error) {
      logQuizDraftSync('local_save.failure', {
        testId: testIdRef.current,
        message: error instanceof Error ? error.message : 'unknown',
      });
      setStatus('error');
      return false;
    }
  }, []);

  const resolveVersionConflict = useCallback(async (/** @type {number} */ testIdNum) => {
    const token = getAdminToken();
    const latest = await adminApi.getQuizDraft(token, testIdNum);
    const latestDraft = latest?.data?.draft ?? null;
    const latestVersion = latestDraft?.version == null ? null : Number(latestDraft.version);

    const useServer = window.confirm(
      'This quiz draft was updated in another session.\n\n' +
        'OK = Load the server version (you may lose unsaved local edits).\n' +
        'Cancel = Keep your current edits and retry saving.'
    );

    if (useServer) {
      logQuizDraftSync('conflict.resolved.server', { testId: testIdNum, latestVersion });
      window.location.reload();
      return { retry: false, version: latestVersion };
    }

    if (Number.isFinite(latestVersion) && latestVersion > 0) {
      onServerVersionRef.current(latestVersion);
      serverVersionRef.current = latestVersion;
      logQuizDraftSync('conflict.resolved.local_retry', { testId: testIdNum, latestVersion });
      return { retry: true, version: latestVersion };
    }

    return { retry: false, version: serverVersionRef.current };
  }, []);

  const runServerSave = useCallback(
    async function runServerSave(
      /** @type {import('../types/quizBuilder.types.js').QuizQuestion[]} */ questions,
      /** @type {number} */ totalPoints,
      /** @type {number} */ retryAttempt = 0
    ) {
      const tid = testIdRef.current;
      if (!tid || readOnly || !syncEnabled) {
        return { ok: false, error: 'Draft sync is not available.' };
      }

      const token = getAdminToken();
      if (!token) {
        setStatus('error');
        logQuizDraftSync('server_save.failure', {
          testId: tid,
          kind: 'unauthenticated',
          message: 'Missing admin session',
        });
        return { ok: false, error: 'Authentication required to save the draft.' };
      }

      const persistableQuestions = filterPersistableQuizDraftQuestions(questions);
      const clientValidation = validateQuizDraftQuestionsClient(questions);
      if (!clientValidation.valid) {
        const message = primaryClientValidationMessage(clientValidation.issues);
        setStatus('error');
        setSaveError(message);
        logQuizDraftSync('server_save.client_validation', {
          testId: tid,
          issueCount: clientValidation.issues.length,
          message,
        });
        return { ok: false, error: message };
      }

      let draftPayload;

      try {
        draftPayload = buildQuizDraftPayload({
          testId: tid,
          storageKey: storageKeyRef.current,
          questions: persistableQuestions,
          totalPoints: persistableQuestions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
        });
      } catch (error) {
        setStatus('error');
        const message = error instanceof Error ? error.message : 'Invalid draft payload.';
        logQuizDraftSync('server_save.invalid_payload', {
          testId: tid,
          message,
        });
        return { ok: false, error: message };
      }

      const fingerprint = fingerprintDraftPayload(draftPayload);
      if (
        fingerprint &&
        fingerprint === lastSyncedFingerprintRef.current &&
        serverVersionRef.current != null
      ) {
        logQuizDraftSync('server_save.skipped_duplicate', { testId: tid });
        writeQuizDraft({
          storageKey: storageKeyRef.current,
          testId: tid,
          questions,
          totalPoints,
          serverVersion: serverVersionRef.current,
          savedAt: draftPayload.savedAt,
          syncState: 'synced',
        });
        onSavedRef.current?.();
        onServerSavedRef.current?.();
        setLastSavedAt(draftPayload.savedAt);
        setStatus('saved');
        setSaveError('');
        return { ok: true, savedAt: draftPayload.savedAt };
      }

      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const body = {
        draftPayload,
        expectedVersion: serverVersionRef.current,
      };

      if (publishedEditEnabledRef.current) {
        body.confirm_published_edit = true;
      }

      const startedAt = performance.now();
      setStatus('saving');

      try {
        const response = await adminApi.putQuizDraft(token, tid, body, {
          signal: abortRef.current.signal,
        });

        const savedDraft = response?.data?.draft ?? null;
        const nextVersion = savedDraft?.version == null ? null : Number(savedDraft.version);

        if (Number.isFinite(nextVersion) && nextVersion > 0) {
          onServerVersionRef.current(nextVersion);
          serverVersionRef.current = nextVersion;
        }

        writeQuizDraft({
          storageKey: storageKeyRef.current,
          testId: tid,
          questions,
          totalPoints,
          serverVersion: serverVersionRef.current,
          savedAt: draftPayload.savedAt,
          syncState: 'synced',
        });

        if (fingerprint) {
          lastSyncedFingerprintRef.current = fingerprint;
        }

        onSavedRef.current?.();
        onServerSavedRef.current?.();
        setLastSavedAt(draftPayload.savedAt);
        setStatus('saved');
        setSaveError('');

        logQuizDraftSync('server_save.success', {
          testId: tid,
          version: nextVersion,
          questionCount: draftPayload.questions.length,
          durationMs: Math.round(performance.now() - startedAt),
          retryAttempt,
        });

        return { ok: true, savedAt: draftPayload.savedAt };
      } catch (error) {
        if (error?.name === 'AbortError') {
          return { ok: false, error: 'Save was interrupted.' };
        }

        const classified = classifyServerSaveError(error);

        logQuizDraftSync('server_save.failure', {
          testId: tid,
          kind: classified.kind,
          status: classified.status,
          errorCode: classified.errorCode,
          message: classified.message,
          durationMs: Math.round(performance.now() - startedAt),
          retryAttempt,
        });

        if (classified.kind === 'conflict') {
          try {
            const resolution = await resolveVersionConflict(Number(tid));
            if (resolution.retry) {
              return runServerSave(questions, totalPoints, 0);
            }
            const conflictMessage = (() => {
              const details = extractVersionConflictDetails(error);
              return details
                ? formatConflictMessage(details)
                : 'This quiz draft was updated in another session.';
            })();
            setStatus('error');
            setSaveError(conflictMessage);
            return { ok: false, error: conflictMessage };
          } catch (conflictError) {
            logQuizDraftSync('conflict.resolve.failure', {
              testId: tid,
              message: conflictError instanceof Error ? conflictError.message : 'unknown',
            });
            setStatus('error');
            return {
              ok: false,
              error: conflictError instanceof Error ? conflictError.message : 'Version conflict.',
            };
          }
        }

        if (classified.retryable && retryAttempt < MAX_SERVER_SAVE_RETRIES) {
          const delay = serverSaveRetryDelayMs(retryAttempt);
          logQuizDraftSync('server_save.retry_scheduled', {
            testId: tid,
            retryAttempt: retryAttempt + 1,
            delayMs: delay,
          });
          setStatus(classified.kind === 'network' ? 'offline' : 'saving');
          await new Promise((resolve) => window.setTimeout(resolve, delay));
          return runServerSave(questions, totalPoints, retryAttempt + 1);
        }

        if (classified.kind === 'validation') {
          const message = formatServerSaveValidationMessage(error);
          setSaveError(message);
          setStatus('error');
          return { ok: false, error: message };
        }

        if (
          classified.kind === 'network' ||
          classified.kind === 'timeout' ||
          classified.kind === 'server'
        ) {
          setStatus('offline');
          return { ok: false, error: classified.message, offline: true };
        }

        setSaveError(classified.message);
        setStatus('error');
        return { ok: false, error: classified.message };
      }
    },
    [readOnly, resolveVersionConflict, syncEnabled]
  );

  const pushServerDraft = useCallback(
    async (/** @type {number} */ retryAttempt = 0) => {
      if (serverInFlightRef.current) {
        pendingServerSyncRef.current = true;
        return;
      }

      serverInFlightRef.current = true;
      pendingServerSyncRef.current = false;

      try {
        await runServerSave(
          stateRef.current.questions,
          totalPointsRef.current,
          retryAttempt
        );
      } finally {
        serverInFlightRef.current = false;
        if (pendingServerSyncRef.current) {
          pendingServerSyncRef.current = false;
          window.setTimeout(() => {
            void pushServerDraft(0);
          }, 250);
        }
      }
    },
    [runServerSave]
  );

  /**
   * Immediate local + server persistence for bulk operations (e.g. Aiken load).
   * Bypasses debounce and must complete before the UI reports success.
   *
   * @param {import('../types/quizBuilder.types.js').QuizQuestion[]} questions
   * @param {number} totalPoints
   * @returns {Promise<DraftPersistResult>}
   */
  const persistDraftImmediately = useCallback(
    async (questions, totalPoints) => {
      const tid = testIdRef.current;
      if (!tid || readOnly || !syncEnabled) {
        return { ok: false, error: 'Draft sync is not available.' };
      }

      clearPendingSaveTimers({ localTimerRef, serverTimerRef });
      abortRef.current?.abort();
      serverInFlightRef.current = false;
      pendingServerSyncRef.current = false;

      const clientValidation = validateQuizDraftQuestionsClient(questions);
      if (!clientValidation.valid) {
        const message = primaryClientValidationMessage(clientValidation.issues);
        setStatus('error');
        setSaveError(message);
        return { ok: false, error: message };
      }

      const persistableQuestions = filterPersistableQuizDraftQuestions(questions);
      const persistablePoints = persistableQuestions.reduce(
        (sum, question) => sum + (Number(question.points) || 0),
        0
      );

      try {
        const savedAt = writeQuizDraft({
          storageKey: storageKeyRef.current,
          testId: tid,
          questions,
          totalPoints,
          serverVersion: serverVersionRef.current,
          syncState: 'pending',
        });
        setLastSavedAt(savedAt);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not save draft locally.';
        setStatus('error');
        setSaveError(message);
        logQuizDraftSync('aiken_import.local_save.failure', { testId: tid, message });
        return { ok: false, error: message };
      }

      serverInFlightRef.current = true;
      let result;
      try {
        result = await runServerSave(persistableQuestions, persistablePoints, 0);
      } finally {
        serverInFlightRef.current = false;
      }

      if (result.ok) {
        stateRef.current = { questions, isDirty: false };
        totalPointsRef.current = totalPoints;
        logQuizDraftSync('aiken_import.immediate_save.success', {
          testId: tid,
          questionCount: questions.length,
        });
        return result;
      }

      logQuizDraftSync('aiken_import.immediate_save.failure', {
        testId: tid,
        message: result.error,
        offline: Boolean(result.offline),
      });
      return result;
    },
    [readOnly, runServerSave, syncEnabled]
  );

  const scheduleServerSync = useCallback(() => {
    if (serverTimerRef.current) {
      window.clearTimeout(serverTimerRef.current);
    }
    serverTimerRef.current = window.setTimeout(() => {
      void pushServerDraft(0);
    }, QUIZ_DRAFT_SERVER_DEBOUNCE_MS);
  }, [pushServerDraft]);

  useEffect(() => {
    if (readOnly) {
      setStatus('saved');
      return undefined;
    }
    if (!syncEnabled || !testId) return undefined;
    if (!state.isDirty) return undefined;

    setStatus('unsaved');

    if (localTimerRef.current) {
      window.clearTimeout(localTimerRef.current);
    }

    localTimerRef.current = window.setTimeout(() => {
      persistLocalBackup();
      if (testIdRef.current) {
        scheduleServerSync();
      }
    }, QUIZ_DRAFT_DEBOUNCE_MS);

    return () => {
      if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
    };
  }, [
    persistLocalBackup,
    readOnly,
    scheduleServerSync,
    state.isDirty,
    state.questions,
    storageKey,
    syncEnabled,
    testId,
    totalPoints,
  ]);

  useEffect(() => {
    if (readOnly) return undefined;

    function flushOnExit() {
      if (!stateRef.current.isDirty) return;
      persistLocalBackup();
      if (testIdRef.current && syncEnabled) {
        if (serverTimerRef.current) {
          window.clearTimeout(serverTimerRef.current);
        }
        void pushServerDraft(0);
      }
    }

    window.addEventListener('beforeunload', flushOnExit);
    return () => {
      window.removeEventListener('beforeunload', flushOnExit);
      flushOnExit();
      if (serverTimerRef.current) window.clearTimeout(serverTimerRef.current);
      abortRef.current?.abort();
    };
  }, [persistLocalBackup, pushServerDraft, readOnly, syncEnabled]);

  useEffect(() => {
    if (readOnly || !syncEnabled || !testId) return undefined;
    if (initialPushDoneRef.current) return undefined;

    const localRecord = readLocalDraftRecord(storageKey);
    const hasLocalQuestions = Boolean(localRecord?.questions?.length);
    const pendingLocalSync = localRecord?.syncState === 'pending';
    const shouldPush =
      hasLocalQuestions &&
      filterPersistableQuizDraftQuestions(localRecord.questions).length > 0 &&
      (serverVersion == null || pendingLocalSync || needsServerSync);

    if (!shouldPush) {
      initialPushDoneRef.current = true;
      return undefined;
    }

    initialPushDoneRef.current = true;
    scheduleServerSync();
  }, [
    needsServerSync,
    readOnly,
    scheduleServerSync,
    serverVersion,
    storageKey,
    syncEnabled,
    testId,
  ]);

  useEffect(() => {
    if (readOnly || !syncEnabled || !testId || !needsServerSync) return undefined;
    if (!filterPersistableQuizDraftQuestions(stateRef.current.questions).length) return undefined;
    scheduleServerSync();
  }, [needsServerSync, readOnly, scheduleServerSync, state.questions, syncEnabled, testId]);

  useEffect(() => {
    if (readOnly || !syncEnabled || !testId) return undefined;

    function handleOnline() {
      if (stateRef.current.isDirty || status === 'offline') {
        scheduleServerSync();
      }
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [readOnly, scheduleServerSync, status, syncEnabled, testId]);

  return { status, lastSavedAt, saveError, persistDraftImmediately };
}
