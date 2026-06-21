import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../../api/adminApi.js';
import { getAdminToken } from '../../../auth/session.js';
import {
  classifyHydrationError,
  validateServerDraftHydrationResponse,
} from '../persistence/quizDraftHydrationValidation.js';
import { mapRuntimeQuestionsToQuizDraft } from '../persistence/mapRuntimeQuestionsToQuizDraft.js';
import {
  formatRecoveryBannerMessage,
  resolveQuizDraftRecovery,
} from '../persistence/quizDraftRecovery.js';
import { inspectLocalDraft, writeQuizDraft } from '../persistence/quizDraftStorage.js';
import { logQuizDraftSync } from '../persistence/quizDraftTelemetry.js';
import { createQuizQuestion } from '../state/quizQuestionFactory.js';

/** @typedef {'pending' | 'ready' | 'error'} QuizDraftHydrationState */

/**
 * @typedef {import('../persistence/quizDraftRecovery.js').QuizDraftRecoveryResult & {
 *   message: string|null,
 * }} QuizDraftRecoveryInfo
 */

/**
 * A4 — Server-first hydration with production recovery fallbacks.
 *
 * Priority: server draft → unsynced local → local backup → empty builder.
 *
 * @param {{
 *   testId?: string | null,
 *   storageKey: string,
 *   readOnly?: boolean,
 *   editPublished?: boolean,
 *   pauseUntilReady?: boolean,
 *   actions: {
 *     loadDraft: (
 *       questions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *       options?: { markDirty?: boolean }
 *     ) => void,
 *   },
 *   onServerVersion: (version: number|null) => void,
 * }} options
 */
export function useQuizDraftHydration({
  testId,
  storageKey,
  readOnly = false,
  editPublished = false,
  pauseUntilReady = false,
  actions,
  onServerVersion,
}) {
  const [hydrationState, setHydrationState] = useState(/** @type {QuizDraftHydrationState} */ ('pending'));
  const [hydrationError, setHydrationError] = useState('');
  const [recovery, setRecovery] = useState(/** @type {QuizDraftRecoveryInfo|null} */ (null));
  const [hydrationAttempt, setHydrationAttempt] = useState(0);

  const actionsRef = useRef(actions);
  const onServerVersionRef = useRef(onServerVersion);
  actionsRef.current = actions;
  onServerVersionRef.current = onServerVersion;

  const retryHydration = useCallback(() => {
    setHydrationAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!testId) {
      setHydrationState('ready');
      setRecovery(null);
      setHydrationError('');
      onServerVersion(null);
      return undefined;
    }

    if (pauseUntilReady) {
      setHydrationState('pending');
      return undefined;
    }

    let cancelled = false;

    function applyRecovery(
      /** @type {import('../persistence/quizDraftRecovery.js').QuizDraftRecoveryResult} */ result,
      /** @type {import('../persistence/quizDraftHydrationValidation.js').HydrationValidationSuccess|null} */ validation
    ) {
      let questions = /** @type {import('../types/quizBuilder.types.js').QuizQuestion[]} */ (
        result.questions
      );

      if (!Array.isArray(questions) || questions.length === 0) {
        questions = [createQuizQuestion()];
      }

      actionsRef.current.loadDraft(questions, { markDirty: result.markDirty });
      onServerVersionRef.current(result.serverVersion);

      const syncState = result.needsSync ? 'pending' : 'synced';

      try {
        writeQuizDraft({
          storageKey,
          testId,
          questions,
          totalPoints: questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
          serverVersion: result.serverVersion,
          savedAt: result.savedAt || undefined,
          syncState,
        });
      } catch (localWriteError) {
        logQuizDraftSync('recovery.local_backup.failure', {
          testId,
          message: localWriteError instanceof Error ? localWriteError.message : 'unknown',
        });
      }

      const recoveryInfo = {
        ...result,
        message: formatRecoveryBannerMessage(result),
      };

      setRecovery(recoveryInfo.message ? recoveryInfo : null);

      logQuizDraftSync('recovery.success', {
        testId,
        source: result.source,
        fallbackReason: result.fallbackReason,
        needsSync: result.needsSync,
        markDirty: result.markDirty,
        questionCount: questions.length,
        serverVersion: result.serverVersion,
        draftId: validation?.draftId ?? null,
      });

      setHydrationState('ready');
      setHydrationError('');
    }

    async function hydrate() {
      setHydrationState('pending');
      setHydrationError('');
      setRecovery(null);

      const localInspection = inspectLocalDraft(storageKey);
      const localRecord = localInspection.record;

      if (localInspection.status === 'corrupt') {
        logQuizDraftSync('recovery.corrupt_local', { testId, storageKey });
      }

      const token = getAdminToken();
      if (!token) {
        if (localRecord?.questions?.length) {
          applyRecovery(
            resolveQuizDraftRecovery({
              hasServerDraft: false,
              server: null,
              local: localRecord,
              serverUnavailable: true,
              fallbackReason: 'session',
            }),
            null
          );
          return;
        }

        const message = 'Authentication required to load the server draft.';
        setHydrationError(message);
        setHydrationState('error');
        logQuizDraftSync('recovery.error', { testId, kind: 'unauthenticated', message });
        onServerVersionRef.current(null);
        return;
      }

      try {
        if (readOnly) {
          const runtimeRes = await adminApi.testQuestions(token, testId);
          if (cancelled) return;

          const linked = runtimeRes?.data?.questions ?? [];
          const mapped = mapRuntimeQuestionsToQuizDraft(linked);
          const questions = mapped.length > 0 ? mapped : [createQuizQuestion()];

          actionsRef.current.loadDraft(questions);
          onServerVersionRef.current(null);

          try {
            writeQuizDraft({
              storageKey,
              testId,
              questions,
              totalPoints: questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0),
              serverVersion: null,
              syncState: 'synced',
            });
          } catch {
            // read-only cache is best-effort
          }

          logQuizDraftSync('hydration.runtime.success', {
            testId,
            questionCount: questions.length,
          });
          setHydrationState('ready');
          return;
        }

        const serverRes = await adminApi.getQuizDraft(token, testId);
        if (cancelled) return;

        const validation = validateServerDraftHydrationResponse(testId, serverRes?.data ?? null);

        if (!validation.ok) {
          logQuizDraftSync('recovery.validation.failure', {
            testId,
            code: validation.code,
            message: validation.message,
          });

          if (localRecord?.questions?.length) {
            applyRecovery(
              resolveQuizDraftRecovery({
                hasServerDraft: false,
                server: null,
                local: localRecord,
                fallbackReason: 'invalid_server',
              }),
              null
            );
            return;
          }

          setHydrationError(validation.message);
          setHydrationState('error');
          onServerVersionRef.current(null);
          return;
        }

        const recoveryResult = resolveQuizDraftRecovery({
          hasServerDraft: validation.hasServerDraft,
          server: validation.hasServerDraft
            ? {
                questions: validation.questions,
                savedAt: validation.savedAt,
                version: validation.serverVersion,
                lastModified: validation.lastModified,
              }
            : null,
          local: localRecord,
        });

        if (editPublished && !validation.hasServerDraft) {
          const runtimeRes = await adminApi.testQuestions(token, testId);
          if (cancelled) return;
          const linked = runtimeRes?.data?.questions ?? [];
          const mapped = mapRuntimeQuestionsToQuizDraft(linked);
          if (mapped.length > 0) {
            applyRecovery(
              {
                ...recoveryResult,
                questions: mapped,
                markDirty: true,
                needsSync: true,
                source: 'runtime_bootstrap',
              },
              validation
            );
            return;
          }
        }

        applyRecovery(recoveryResult, validation);
      } catch (error) {
        if (cancelled) return;

        const classified = classifyHydrationError(error);
        logQuizDraftSync('recovery.error', {
          testId,
          kind: classified.kind,
          message: classified.message,
          status: error?.status ?? null,
        });

        if (classified.kind === 'forbidden') {
          setHydrationError(classified.message);
          setHydrationState('error');
          onServerVersionRef.current(null);
          return;
        }

        if (localRecord?.questions?.length) {
          applyRecovery(
            resolveQuizDraftRecovery({
              hasServerDraft: false,
              server: null,
              local: localRecord,
              serverUnavailable: true,
              fallbackReason:
                classified.kind === 'session_expired' ? 'session' : 'network',
            }),
            null
          );
          return;
        }

        setHydrationError(classified.message);
        setHydrationState('error');
        onServerVersionRef.current(null);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, [editPublished, hydrationAttempt, pauseUntilReady, readOnly, storageKey, testId]);

  useEffect(() => {
    if (!testId || readOnly || pauseUntilReady) return undefined;

    function handleOnline() {
      if (hydrationState === 'error') {
        retryHydration();
      }
    }

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [hydrationState, pauseUntilReady, readOnly, retryHydration, testId]);

  return { hydrationState, hydrationError, recovery, retryHydration };
}
