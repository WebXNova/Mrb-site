import { useCallback, useMemo } from 'react';
import { explanationValidationMessage } from '../utils/validateExplanation.js';

/**
 * Save flow placeholder — no API calls in Phase 1.
 *
 * Options and explanation must always be validated server-side before persistence.
 * Future: POST /api/questions with sanitized payload from useSanitizationPipeline.
 */
export function useSaveFlow({ state, sanitizeForSubmit, setFieldErrors }) {
  const submitReadiness = useMemo(() => {
    const payload = sanitizeForSubmit(state);
    const optionsOk = payload.optionsValidation?.ok === true;
    const explanationOk = payload.explanationValidation?.ok === true;

    const errors = {};
    if (!optionsOk && payload.optionsValidation?.errors?.length) {
      errors.options = payload.optionsValidation.errors.map((e) => e.message).join(' ');
    }
    if (!explanationOk && payload.explanationValidation) {
      errors.explanation = explanationValidationMessage(payload.explanationValidation);
    }

    return { payload, optionsOk, explanationOk, errors, ready: optionsOk && explanationOk };
  }, [sanitizeForSubmit, state]);

  const canSave = useMemo(() => {
    if (state.ui.loading) return false;
    // Phase 1: gate on client validation; API wiring still pending.
    return submitReadiness.ready;
  }, [state.ui.loading, submitReadiness.ready]);

  const save = useCallback(async () => {
    if (!submitReadiness.ready) {
      setFieldErrors?.(submitReadiness.errors);
      return { ok: false, reason: 'validation_failed', errors: submitReadiness.errors };
    }
    return { ok: false, reason: 'save_not_implemented', payload: submitReadiness.payload };
  }, [setFieldErrors, submitReadiness]);

  const saveDraft = useCallback(async () => {
    return { ok: false, reason: 'draft_not_implemented' };
  }, []);

  return useMemo(
    () => ({
      canSave,
      save,
      saveDraft,
      isImplemented: false,
    }),
    [canSave, save, saveDraft]
  );
}
