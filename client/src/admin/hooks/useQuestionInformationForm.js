import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { useCourseSubjects } from './useCourseSubjects';
import {
  createDefaultQuestionInformationForm,
  isQuestionInformationReady,
  validateQuestionInformation,
} from '../utils/questionInformationValidation';

/**
 * State + validation for the Question Information section (Create Question page).
 * @param {string} token
 */
export function useQuestionInformationForm(token) {
  const [courses, setCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState('');
  const [form, setForm] = useState(createDefaultQuestionInformationForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touched, setTouched] = useState({});

  const { subjects, subjectIds, isLoading: isLoadingSubjects, error: subjectsError } = useCourseSubjects(
    token,
    form.course_id
  );

  useEffect(() => {
    let cancelled = false;
    setIsLoadingCourses(true);
    setCoursesError('');
    adminApi
      .courses(token)
      .then((response) => {
        if (cancelled) return;
        setCourses(Array.isArray(response?.data) ? response.data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setCourses([]);
        setCoursesError(err.message || 'Failed to load courses.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCourses(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const validationOptions = useMemo(
    () => ({
      subjectIds,
      isLoadingSubjects,
      subjectsError,
    }),
    [subjectIds, isLoadingSubjects, subjectsError]
  );

  const canProceed = useMemo(
    () => isQuestionInformationReady(form, validationOptions),
    [form, validationOptions]
  );

  const validateAll = useCallback(() => {
    const result = validateQuestionInformation(form, validationOptions);
    setFieldErrors(result.fieldErrors);
    return result;
  }, [form, validationOptions]);

  const validateField = useCallback(
    (fieldName) => {
      const result = validateQuestionInformation(form, validationOptions);
      setFieldErrors((prev) => ({
        ...prev,
        [fieldName]: result.fieldErrors[fieldName] || '',
      }));
    },
    [form, validationOptions]
  );

  function onChange(event) {
    const { name, value } = event.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'course_id') {
        next.subject_id = '';
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

  function onBlur(event) {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    validateField(name);
  }

  function showError(fieldName) {
    return Boolean(touched[fieldName] && fieldErrors[fieldName]);
  }

  function getFieldError(fieldName) {
    return touched[fieldName] ? fieldErrors[fieldName] || '' : '';
  }

  return {
    form,
    setForm,
    fieldErrors,
    touched,
    courses,
    subjects,
    isLoadingCourses,
    coursesError,
    isLoadingSubjects,
    subjectsError,
    canProceed,
    onChange,
    onBlur,
    validateAll,
    validateField,
    showError,
    getFieldError,
    validationOptions,
  };
}
