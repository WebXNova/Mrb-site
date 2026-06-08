import { useCallback, useMemo, useState } from 'react';
import {
  createDefaultQuestionContentForm,
  isQuestionContentReady,
  validateQuestionContent,
} from '../utils/questionContentValidation.js';
import { validateQuestionImageUrl } from '../utils/questionImageUrlValidation.js';

/**
 * State + validation for the Question Content section.
 */
export function useQuestionContentForm() {
  const [form, setForm] = useState(createDefaultQuestionContentForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [imageUrlDraftError, setImageUrlDraftError] = useState('');

  const canProceed = useMemo(() => isQuestionContentReady(form), [form]);

  const validateAll = useCallback(() => {
    const result = validateQuestionContent(form);
    setFieldErrors(result.fieldErrors);
    return result;
  }, [form]);

  const validateField = useCallback(
    (fieldName) => {
      const result = validateQuestionContent(form);
      setFieldErrors((prev) => ({
        ...prev,
        [fieldName]: result.fieldErrors[fieldName] || '',
      }));
    },
    [form]
  );

  function onQuestionTextChange(html) {
    setForm((prev) => ({ ...prev, questionTextHtml: html }));
    setFieldErrors((prev) => {
      if (!prev.questionTextHtml) return prev;
      const next = { ...prev };
      delete next.questionTextHtml;
      return next;
    });
  }

  function onQuestionTextBlur(html) {
    setTouched((prev) => ({ ...prev, questionTextHtml: true }));
    setForm((prev) => ({ ...prev, questionTextHtml: html }));
    validateField('questionTextHtml');
  }

  function setUploadedImageUrl(url) {
    const check = validateQuestionImageUrl(url);
    if (!check.ok) {
      setFieldErrors((prev) => ({ ...prev, questionImageUrl: check.message }));
      return false;
    }
    setForm((prev) => ({
      ...prev,
      questionImageUrl: check.url,
      questionImageSource: 'upload',
    }));
    setImageUrlDraft('');
    setImageUrlDraftError('');
    setFieldErrors((prev) => {
      if (!prev.questionImageUrl) return prev;
      const next = { ...prev };
      delete next.questionImageUrl;
      return next;
    });
    return true;
  }

  function applyImageUrlDraft() {
    const check = validateQuestionImageUrl(imageUrlDraft);
    if (!check.ok) {
      setImageUrlDraftError(check.message);
      setTouched((prev) => ({ ...prev, questionImageUrl: true }));
      return false;
    }
    setForm((prev) => ({
      ...prev,
      questionImageUrl: check.url,
      questionImageSource: 'url',
    }));
    setImageUrlDraft('');
    setImageUrlDraftError('');
    setFieldErrors((prev) => {
      if (!prev.questionImageUrl) return prev;
      const next = { ...prev };
      delete next.questionImageUrl;
      return next;
    });
    return true;
  }

  function removeQuestionImage() {
    setForm((prev) => ({
      ...prev,
      questionImageUrl: '',
      questionImageSource: 'none',
    }));
    setImageUrlDraft('');
    setImageUrlDraftError('');
    setFieldErrors((prev) => {
      if (!prev.questionImageUrl) return prev;
      const next = { ...prev };
      delete next.questionImageUrl;
      return next;
    });
  }

  function beginReplaceImage() {
    removeQuestionImage();
    setTouched((prev) => ({ ...prev, questionImageUrl: true }));
  }

  function onImageUrlDraftChange(value) {
    setImageUrlDraft(value);
    if (imageUrlDraftError) setImageUrlDraftError('');
  }

  function showError(fieldName) {
    return Boolean(touched[fieldName] && fieldErrors[fieldName]);
  }

  function getFieldError(fieldName) {
    return touched[fieldName] ? fieldErrors[fieldName] || '' : '';
  }

  return {
    form,
    fieldErrors,
    touched,
    imageUrlDraft,
    imageUrlDraftError,
    canProceed,
    onQuestionTextChange,
    onQuestionTextBlur,
    setUploadedImageUrl,
    applyImageUrlDraft,
    removeQuestionImage,
    beginReplaceImage,
    onImageUrlDraftChange,
    validateAll,
    showError,
    getFieldError,
  };
}
