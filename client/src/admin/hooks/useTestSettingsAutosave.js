import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SETTINGS_LOCAL_DEBOUNCE_MS,
  SETTINGS_SERVER_DEBOUNCE_MS,
  clearTestSettingsDraft,
  fingerprintSettingsForm,
  readTestSettingsDraft,
  writeTestSettingsDraft,
} from '../utils/testSettingsDraftStorage.js';

/** @typedef {'saved' | 'saving' | 'unsaved' | 'error'} SettingsAutosaveStatus */

/**
 * Debounced local backup + server persist for the Settings page.
 *
 * @param {{
 *   testId: string|number|null,
 *   form: Record<string, unknown>,
 *   enabled?: boolean,
 *   persist: (form: Record<string, unknown>) => Promise<{ ok: boolean, error?: string }>,
 *   isReady?: boolean,
 * }} options
 */
export function useTestSettingsAutosave({ testId, form, enabled = true, persist, isReady = true }) {
  const [status, setStatus] = useState(/** @type {SettingsAutosaveStatus} */ ('saved'));
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [saveError, setSaveError] = useState('');

  const formRef = useRef(form);
  const persistRef = useRef(persist);
  const fingerprintRef = useRef(fingerprintSettingsForm(form));
  const localTimerRef = useRef(/** @type {number|null} */ (null));
  const serverTimerRef = useRef(/** @type {number|null} */ (null));
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const readyRef = useRef(false);

  formRef.current = form;
  persistRef.current = persist;

  const persistLocal = useCallback(
    (syncState = 'pending') => {
      if (!testId) return null;
      return writeTestSettingsDraft(testId, formRef.current, syncState);
    },
    [testId]
  );

  const persistServer = useCallback(async () => {
    if (!enabled || !testId) return { ok: false, error: 'Autosave is not available.' };
    const snapshot = formRef.current;
    const fingerprint = fingerprintSettingsForm(snapshot);
    if (fingerprint && fingerprint === fingerprintRef.current) {
      return { ok: true };
    }

    inFlightRef.current = true;
    setStatus('saving');
    setSaveError('');
    try {
      const result = await persistRef.current(snapshot);
      if (!result?.ok) {
        persistLocal('pending');
        setStatus('error');
        setSaveError(result?.error || 'Unable to save settings.');
        return result || { ok: false, error: 'Unable to save settings.' };
      }
      fingerprintRef.current = fingerprint;
      const savedAt = persistLocal('synced');
      if (savedAt) setLastSavedAt(savedAt);
      setStatus('saved');
      setSaveError('');
      return { ok: true, savedAt };
    } catch (error) {
      persistLocal('pending');
      const message = error instanceof Error ? error.message : 'Unable to save settings.';
      setStatus('error');
      setSaveError(message);
      return { ok: false, error: message };
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        window.setTimeout(() => {
          void persistServer();
        }, 200);
      }
    }
  }, [enabled, persistLocal, testId]);

  const scheduleSave = useCallback(() => {
    if (!enabled || !readyRef.current) return;
    setStatus((prev) => (prev === 'saving' ? prev : 'unsaved'));
    if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
    if (serverTimerRef.current) window.clearTimeout(serverTimerRef.current);

    localTimerRef.current = window.setTimeout(() => {
      persistLocal('pending');
    }, SETTINGS_LOCAL_DEBOUNCE_MS);

    serverTimerRef.current = window.setTimeout(() => {
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      void persistServer();
    }, SETTINGS_SERVER_DEBOUNCE_MS);
  }, [enabled, persistLocal, persistServer]);

  const saveNow = useCallback(async () => {
    if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
    if (serverTimerRef.current) window.clearTimeout(serverTimerRef.current);
    persistLocal('pending');
    return persistServer();
  }, [persistLocal, persistServer]);

  const markSynced = useCallback(
    (nextForm) => {
      fingerprintRef.current = fingerprintSettingsForm(nextForm ?? formRef.current);
      const savedAt = persistLocal('synced');
      if (savedAt) setLastSavedAt(savedAt);
      setStatus('saved');
      setSaveError('');
    },
    [persistLocal]
  );

  const restorePendingDraft = useCallback(
    (serverForm) => {
      const local = readTestSettingsDraft(testId);
      if (!local?.form || local.syncState !== 'pending') return null;
      if (local.fingerprint === fingerprintSettingsForm(serverForm)) {
        clearTestSettingsDraft(testId);
        return null;
      }
      return local.form;
    },
    [testId]
  );

  useEffect(() => {
    readyRef.current = Boolean(isReady);
    if (isReady && fingerprintRef.current == null) {
      fingerprintRef.current = fingerprintSettingsForm(formRef.current);
    }
  }, [isReady]);

  useEffect(() => {
    if (!enabled || !isReady) return undefined;
    const nextFingerprint = fingerprintSettingsForm(form);
    if (nextFingerprint === fingerprintRef.current) return undefined;
    scheduleSave();
    return undefined;
  }, [enabled, form, isReady, scheduleSave]);

  useEffect(() => {
    if (!enabled) return undefined;
    function flush() {
      if (!readyRef.current) return;
      if (fingerprintSettingsForm(formRef.current) === fingerprintRef.current) return;
      persistLocal('pending');
    }
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      if (localTimerRef.current) window.clearTimeout(localTimerRef.current);
      if (serverTimerRef.current) window.clearTimeout(serverTimerRef.current);
    };
  }, [enabled, persistLocal]);

  return {
    status,
    lastSavedAt,
    saveError,
    saveNow,
    markSynced,
    restorePendingDraft,
    setStatus,
    setSaveError,
  };
}
