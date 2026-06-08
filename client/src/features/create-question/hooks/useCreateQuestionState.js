import { useCallback, useMemo, useReducer } from 'react';
import { CREATE_QUESTION_ACTIONS } from '../state/createQuestionActions.js';
import { createQuestionReducer } from '../state/createQuestionReducer.js';
import { createInitialCreateQuestionState } from '../state/initialState.js';
import { coerceOptionsIntegrity } from '../utils/options/mcqOptionsCorrectness.js';

/**
 * Centralized Create Question state — useReducer pattern.
 * Avoids uncontrolled mutations; all updates go through dispatch.
 */
export function useCreateQuestionState() {
  const [state, dispatch] = useReducer(createQuestionReducer, undefined, () => {
    const initial = createInitialCreateQuestionState();
    return { ...initial, options: coerceOptionsIntegrity(initial.options) };
  });

  const setMetadataField = useCallback((field, value) => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.SET_METADATA_FIELD, payload: { field, value } });
  }, []);

  const setQuestionText = useCallback((textPlain, textHtmlDraft) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.SET_QUESTION_TEXT,
      payload: { textPlain, textHtmlDraft },
    });
  }, []);

  const updateOptionText = useCallback((optionKey, text) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.UPDATE_OPTION_TEXT,
      payload: { optionKey, text },
    });
  }, []);

  const updateOptionImage = useCallback((optionKey, imageUrl) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.UPDATE_OPTION_IMAGE,
      payload: { optionKey, imageUrl },
    });
  }, []);

  const setCorrectOption = useCallback((optionKey) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.SET_CORRECT_OPTION,
      payload: { optionKey },
    });
  }, []);

  const resetOptions = useCallback(() => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.RESET_OPTIONS });
  }, []);

  const setExplanationText = useCallback((textPlain, textHtmlDraft) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.SET_EXPLANATION_TEXT,
      payload: { textPlain, textHtmlDraft },
    });
  }, []);

  const setQuestionImage = useCallback((url, source) => {
    dispatch({
      type: CREATE_QUESTION_ACTIONS.SET_QUESTION_IMAGE,
      payload: { url, source },
    });
  }, []);

  const removeQuestionImage = useCallback(() => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.REMOVE_QUESTION_IMAGE });
  }, []);

  const setFieldErrors = useCallback((errors) => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.SET_FIELD_ERRORS, payload: errors });
  }, []);

  const clearFieldError = useCallback((field) => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.CLEAR_FIELD_ERROR, payload: field });
  }, []);

  const setPreviewVisible = useCallback((visible) => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.SET_PREVIEW_VISIBLE, payload: visible });
  }, []);

  const resetForm = useCallback(() => {
    dispatch({ type: CREATE_QUESTION_ACTIONS.RESET_FORM });
  }, []);

  const actions = useMemo(
    () => ({
      setMetadataField,
      setQuestionText,
      updateOptionText,
      updateOptionImage,
      setCorrectOption,
      resetOptions,
      setExplanationText,
      setQuestionImage,
      removeQuestionImage,
      setFieldErrors,
      clearFieldError,
      setPreviewVisible,
      resetForm,
    }),
    [
      setMetadataField,
      setQuestionText,
      updateOptionText,
      updateOptionImage,
      setCorrectOption,
      resetOptions,
      setExplanationText,
      setQuestionImage,
      removeQuestionImage,
      setFieldErrors,
      clearFieldError,
      setPreviewVisible,
      resetForm,
    ]
  );

  return { state, dispatch, actions };
}
