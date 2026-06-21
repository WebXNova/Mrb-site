import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { studentApi } from '../../api/studentApi';
import { generateIdempotencyKey } from '../../utils/idempotency';
import {
  countWords,
  meetsQuestionWordRules,
  minWordsRequired,
  MIN_WORDS_TEXT_ONLY,
  MIN_WORDS_WITH_MEDIA,
  validateQuestionBodyLength,
  validateQuestionImageFile,
} from '../../utils/qaQuestionValidation';
import { mapCourseSubjectsForQuestionForm } from '../utils/mapCourseSubjectToQaSlug';
import { formatStudentQuestionSubmitError } from '../utils/studentQuestionErrors';
import { useStudentQuestionAudio } from './useStudentQuestionAudio';

export function useStudentQuestionForm({ onSubmitted, initialSubjectId = null, lockSubject = false, inlineSubmit = false } = {}) {
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef(null);
  const [course, setCourse] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [question, setQuestion] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);

  const audio = useStudentQuestionAudio({ disabled: submitting });

  const hasImage = Boolean(file);
  const hasMedia = hasImage || audio.hasRecording;
  const words = useMemo(() => countWords(question), [question]);
  const minWords = minWordsRequired(hasMedia);
  const canSubmit =
    meetsQuestionWordRules(question, hasMedia) && Boolean(subjectId) && Boolean(course?.id) && !submitting;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoadingContext(true);
      setContextError('');
      try {
        const response = await studentApi.questionFormContext();
        const payload = response?.data ?? {};
        const entitledCourse = payload.course ?? null;
        const mapped = mapCourseSubjectsForQuestionForm(payload.subjects);
        if (!entitledCourse?.id) {
          if (!cancelled) setContextError('No active course enrollment found. Questions require an entitled course.');
          return;
        }
        if (!cancelled) {
          setCourse(entitledCourse);
          setSubjects(mapped);
          const preferred =
            initialSubjectId && mapped.some((s) => String(s.id) === String(initialSubjectId))
              ? String(initialSubjectId)
              : mapped[0]
                ? String(mapped[0].id)
                : '';
          setSubjectId(preferred);
          if (!mapped.length) {
            setContextError(
              'Your course does not have any subjects set up yet. Please contact support or check back later.',
            );
          }
        }
      } catch (err) {
        if (!cancelled) setContextError(err.message || 'Could not load your course details.');
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialSubjectId]);

  useEffect(() => {
    if (!lockSubject || !initialSubjectId) return;
    setSubjectId(String(initialSubjectId));
  }, [initialSubjectId, lockSubject]);

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
    if (!course?.id) next.course = 'Your entitled course could not be determined.';
    if (!subjectId) next.subject = 'Please choose a subject.';
    const lengthError = validateQuestionBodyLength(question);
    if (lengthError) next.question = lengthError;
    else if (!meetsQuestionWordRules(question, hasMedia)) {
      const minWords = minWordsRequired(hasMedia);
      next.question = hasMedia && !question.trim()
        ? 'Add a short caption or send media only.'
        : `Write at least ${minWords} words (currently ${words}).`;
    }
    if (file) {
      const fileError = validateQuestionImageFile(file);
      if (fileError) next.image = fileError;
    }
    if (audio.error) next.audio = audio.error;
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }, [course?.id, subjectId, question, hasMedia, words, file, audio.error]);

  function onPickFile(event) {
    const picked = event.target.files?.[0];
    setSubmitError('');
    setSuccess(null);
    if (!picked) return;
    const fileError = validateQuestionImageFile(picked);
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
    setQuestion('');
    setFile(null);
    setFieldErrors({});
    audio.clearRecording();
    idempotencyKeyRef.current = null;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError('');
    setSuccess(null);
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
        const up = await studentApi.uploadQuestionImage(file);
        imageUrl = up?.data?.url;
        if (!imageUrl) {
          setSubmitError('Image upload did not return a URL. Try again.');
          return;
        }
      }

      let audioUrl;
      if (audio.blob) {
        const up = await studentApi.uploadQuestionRecording(audio.blob, audio.durationSec);
        audioUrl = up?.data?.url;
        if (!audioUrl) {
          setSubmitError('Voice upload did not return a URL. Try again.');
          return;
        }
      }

      const response = await studentApi.createQuestion(
        {
          subjectId: Number(subjectId),
          body: question.trim(),
          ...(imageUrl ? { imageUrl } : {}),
          ...(audioUrl ? { audioUrl } : {}),
        },
        { idempotencyKey: idempotencyKeyRef.current }
      );
      const created = response?.data;
      if (!created?.id) {
        setSubmitError('Unexpected response from server.');
        return;
      }
      resetForm();
      onSubmitted?.(created);
      if (!inlineSubmit) {
        setSuccess({
          id: created.id,
          message: 'Question submitted successfully',
          detail: 'Your teacher will review your question and respond soon.',
        });
      }
    } catch (err) {
      setSubmitError(formatStudentQuestionSubmitError(err));
      idempotencyKeyRef.current = null;
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  function askAnother() {
    setSuccess(null);
    resetForm();
  }

  return {
    course,
    subjects,
    subjectId,
    setSubjectId,
    question,
    setQuestion,
    file,
    previewUrl,
    loadingContext,
    contextError,
    fieldErrors,
    submitError,
    submitting,
    success,
    canSubmit,
    words,
    minWords,
    hasImage,
    hasMedia,
    audio,
    onPickFile,
    clearFile,
    handleSubmit,
    resetForm,
    askAnother,
    lockSubject,
  };
}
