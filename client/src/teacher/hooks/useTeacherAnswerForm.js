import { useCallback, useEffect, useRef, useState } from 'react';
import { teacherApi } from '../../api/teacherApi';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { useStudentQuestionAudio } from '../../student/hooks/useStudentQuestionAudio';
import { formatTeacherAnswerSubmitError } from '../utils/teacherAnswerErrors';
import {
  meetsTeacherAnswerRules,
  validateTeacherAnswerImageFile,
  validateTeacherAnswerLength,
} from '../utils/teacherAnswerValidation';

export function useTeacherAnswerForm({ questionId, threadId, onAnswered, initialAnswer = '', onAnswerChange }) {
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef(null);
  const [answer, setAnswer] = useState(initialAnswer);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const audio = useStudentQuestionAudio({ disabled: submitting });
  const hasMedia = Boolean(file) || audio.hasRecording;
  const canSubmit =
    meetsTeacherAnswerRules(answer, hasMedia) &&
    Boolean(questionId || threadId) &&
    !submitting;

  useEffect(() => {
    setAnswer(initialAnswer || '');
  }, [questionId, threadId, initialAnswer]);

  function setAnswerWithDraft(value) {
    setAnswer(value);
    onAnswerChange?.(value);
  }

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const validateFields = useCallback(() => {
    const next = {};
    const lengthError = validateTeacherAnswerLength(answer, hasMedia);
    if (lengthError) next.answer = lengthError;
    if (file) {
      const fileError = validateTeacherAnswerImageFile(file);
      if (fileError) next.image = fileError;
    }
    if (audio.error) next.audio = audio.error;
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }, [answer, file, audio.error, hasMedia]);

  function onPickFile(event) {
    const picked = event.target.files?.[0];
    setSubmitError('');
    if (!picked) return;
    const fileError = validateTeacherAnswerImageFile(picked);
    if (fileError) {
      setFieldErrors((prev) => ({ ...prev, image: fileError }));
      event.target.value = '';
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });
    setFile(picked);
  }

  function clearFile() {
    setFile(null);
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.image;
      return next;
    });
  }

  function resetForm() {
    setAnswer('');
    setFile(null);
    setFieldErrors({});
    audio.clearRecording();
    idempotencyKeyRef.current = null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    if (submitLockRef.current || submitting) return;
    if (!validateFields()) return;

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = generateIdempotencyKey();
    }

    submitLockRef.current = true;
    setSubmitting(true);
    try {
      let imageUrl;
      if (file) {
        const up = await teacherApi.uploadAnswerImage(file);
        imageUrl = up?.data?.url;
        if (!imageUrl) {
          setSubmitError('Image upload did not return a URL. Try again.');
          return;
        }
      }

      let audioUrl;
      if (audio.blob) {
        const up = await teacherApi.uploadAnswerRecording(audio.blob, audio.durationSec);
        audioUrl = up?.data?.url;
        if (!audioUrl) {
          setSubmitError('Voice upload did not return a URL. Try again.');
          return;
        }
      }

      const payload = {
        body: answer.trim(),
        ...(imageUrl ? { imageUrl } : {}),
        ...(audioUrl ? { audioUrl } : {}),
      };

      const response = questionId
        ? await teacherApi.submitAnswer(questionId, payload, {
            idempotencyKey: idempotencyKeyRef.current,
          })
        : await teacherApi.sendThreadMessage(threadId, payload, {
            idempotencyKey: idempotencyKeyRef.current,
          });

      const detail = response?.data;
      if (!detail?.id) {
        setSubmitError('Unexpected response from server.');
        return;
      }

      resetForm();
      onAnswered?.(detail);
    } catch (err) {
      setSubmitError(formatTeacherAnswerSubmitError(err));
      idempotencyKeyRef.current = null;
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  return {
    answer,
    setAnswer: setAnswerWithDraft,
    file,
    previewUrl,
    fieldErrors,
    submitError,
    submitting,
    canSubmit,
    hasMedia,
    audio,
    onPickFile,
    clearFile,
    handleSubmit,
  };
}
