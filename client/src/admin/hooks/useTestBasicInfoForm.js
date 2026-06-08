import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { useCourseSubjects } from './useCourseSubjects';
import { useTestCreateOptions } from './useTestCreateOptions';
import {
  createDefaultTestBasicInfoForm,
  isTestBasicInfoFormReady,
  validateTestBasicInfoForm,
} from '../utils/testBasicInfoValidation';

/**
 * Shared state and handlers for TestBasicInfoForm (create + edit).
 */
export function useTestBasicInfoForm(token, { initialForm, applyCreateDefaults = true } = {}) {
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(() => initialForm ?? createDefaultTestBasicInfoForm());
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    options: createOptions,
    categoryValues,
    testTypeValues,
    isLoading: isLoadingOptions,
    error: optionsError,
  } = useTestCreateOptions(token);

  const { subjects, subjectIds, isLoading: isLoadingSubjects, error: subjectsError } = useCourseSubjects(
    token,
    form.course_id
  );

  useEffect(() => {
    if (!applyCreateDefaults || !isLoadingOptions || !createOptions.defaultCategory) return;
    setForm((prev) => {
      if (prev.course_id || prev.title) return prev;
      return {
        ...prev,
        category: prev.category || createOptions.defaultCategory,
        test_type: prev.test_type || createOptions.defaultTestType,
      };
    });
  }, [applyCreateDefaults, isLoadingOptions, createOptions.defaultCategory, createOptions.defaultTestType]);

  useEffect(() => {
    adminApi
      .courses(token)
      .then((response) => setCourses(Array.isArray(response?.data) ? response.data : []))
      .catch(() => setCourses([]));
  }, [token]);

  const validationOptions = useMemo(
    () => ({
      courseSubjectIds: subjectIds,
      isLoadingSubjects,
      subjectsError,
      allowedTestTypes: testTypeValues,
      allowedCategories: categoryValues,
    }),
    [subjectIds, isLoadingSubjects, subjectsError, testTypeValues, categoryValues]
  );

  const canSubmit = useMemo(
    () => !isLoadingOptions && !optionsError && isTestBasicInfoFormReady(form, validationOptions),
    [form, validationOptions, isLoadingOptions, optionsError]
  );

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'course_id') {
        next.subject_id = '';
        next.subject_ids = [];
      }
      if (name === 'test_type') {
        next.subject_id = '';
        next.subject_ids = [];
      }
      return next;
    });
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function onToggleMixedSubject(subjectId) {
    const id = Number(subjectId);
    if (!subjectIds.includes(id)) return;

    setForm((prev) => {
      const current = Array.isArray(prev.subject_ids) ? prev.subject_ids.map(Number) : [];
      const exists = current.includes(id);
      return {
        ...prev,
        subject_ids: exists ? current.filter((sid) => sid !== id) : [...current, id],
      };
    });
    setFieldErrors((prev) => {
      if (!prev.subject_ids) return prev;
      const next = { ...prev };
      delete next.subject_ids;
      return next;
    });
  }

  function validateForSubmit() {
    setError('');
    const validation = validateTestBasicInfoForm(form, validationOptions);
    if (!validation.ok) {
      setFieldErrors(validation.errors);
      return null;
    }
    setFieldErrors({});
    return validation.payload;
  }

  return {
    courses,
    form,
    setForm,
    fieldErrors,
    setFieldErrors,
    error,
    setError,
    success,
    setSuccess,
    isSubmitting,
    setIsSubmitting,
    createOptions,
    subjects,
    subjectIds,
    isLoadingOptions,
    optionsError,
    isLoadingSubjects,
    subjectsError,
    canSubmit,
    onChange,
    onToggleMixedSubject,
    validateForSubmit,
  };
}
