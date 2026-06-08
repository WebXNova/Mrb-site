/**
 * @param {{ defaultCategory?: string, defaultTestType?: string }} [defaults]
 */
export function createDefaultTestBasicInfoForm(defaults = {}) {
  return {
    course_id: '',
    title: '',
    description: '',
    category: defaults.defaultCategory ?? 'MDCAT',
    test_type: defaults.defaultTestType ?? 'subject_wise',
    subject_id: '',
    subject_ids: [],
  };
}

/**
 * @param {ReturnType<createDefaultTestBasicInfoForm>} form
 * @param {{
 *   courseSubjectIds?: number[],
 *   isLoadingSubjects?: boolean,
 *   subjectsError?: string,
 *   allowedTestTypes?: string[],
 *   allowedCategories?: string[],
 * }} [options]
 */
export function validateTestBasicInfoForm(form, options = {}) {
  const {
    courseSubjectIds = [],
    isLoadingSubjects = false,
    subjectsError = '',
    allowedTestTypes = [],
    allowedCategories = [],
  } = options;
  const errors = {};
  const allowedSubjectIds = new Set(
    courseSubjectIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  );
  const testTypeValues =
    allowedTestTypes.length > 0 ? allowedTestTypes : ['subject_wise', 'mixed_subject'];
  const categoryValues = allowedCategories.length > 0 ? allowedCategories : ['MDCAT'];

  const courseId = Number(form.course_id);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    errors.course_id = 'Course is required.';
  }

  const title = String(form.title ?? '').replace(/\s+/g, ' ').trim();
  if (title.length < 3) {
    errors.title = 'Title must be at least 3 characters.';
  } else if (title.length > 120) {
    errors.title = 'Title must not exceed 120 characters.';
  }

  const description = String(form.description ?? '').replace(/\s+/g, ' ').trim();
  if (description.length > 500) {
    errors.description = 'Description must not exceed 500 characters.';
  }

  const category = String(form.category ?? '').trim();
  if (!category || !categoryValues.includes(category)) {
    errors.category = 'Select a valid category.';
  }

  if (!testTypeValues.includes(form.test_type)) {
    errors.test_type = 'Select a valid test type.';
  }

  if (subjectsError) {
    errors.subject_id = subjectsError;
    errors.subject_ids = subjectsError;
  } else if (isLoadingSubjects) {
    errors.subject_id = 'Loading subjects…';
    errors.subject_ids = 'Loading subjects…';
  } else if (courseId > 0 && !allowedSubjectIds.size) {
    const emptyMsg = 'No subjects found for this course. Add subjects to the course first.';
    if (form.test_type === 'subject_wise') errors.subject_id = emptyMsg;
    else errors.subject_ids = emptyMsg;
  } else if (form.test_type === 'subject_wise') {
    const subjectId = Number(form.subject_id);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      errors.subject_id = 'Select a subject from the course.';
    } else if (!allowedSubjectIds.has(subjectId)) {
      errors.subject_id = 'Selected subject is not valid for this course.';
    }
  } else if (form.test_type === 'mixed_subject') {
    const ids = Array.isArray(form.subject_ids)
      ? form.subject_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (!ids.length) {
      errors.subject_ids = 'Select at least one subject from the course.';
    } else {
      const invalid = ids.filter((id) => !allowedSubjectIds.has(id));
      if (invalid.length) {
        errors.subject_ids = 'One or more selected subjects are not valid for this course.';
      }
    }
  }

  if (Object.keys(errors).length) {
    return { ok: false, errors };
  }

  return { ok: true, payload: buildTestBasicInfoPayload(form) };
}

/**
 * @param {ReturnType<createDefaultTestBasicInfoForm>} form
 */
export function buildTestBasicInfoPayload(form) {
  const courseId = Number(form.course_id);
  const title = String(form.title ?? '').replace(/\s+/g, ' ').trim();
  const description = String(form.description ?? '').replace(/\s+/g, ' ').trim();
  const category = String(form.category ?? 'MDCAT').trim() || 'MDCAT';

  const payload = {
    course_id: courseId,
    title,
    category,
    test_type: form.test_type,
  };

  if (description) payload.description = description;

  if (form.test_type === 'subject_wise') {
    payload.subject_id = Number(form.subject_id);
  } else {
    payload.subject_ids = [...new Set(form.subject_ids.map((id) => Number(id)))];
  }

  return payload;
}

/** @deprecated Use buildTestBasicInfoPayload */
export const buildCreateTestPayload = buildTestBasicInfoPayload;

/**
 * @param {{ courseId?: number|null, course_id?: number|string, title?: string, description?: string, category?: string, testType?: string, test_type?: string, subjectIds?: number[] }} test
 */
export function mapTestToBasicInfoForm(test) {
  const rawSubjectIds = Array.isArray(test.subjectIds) ? test.subjectIds : [];
  const subjectIds = rawSubjectIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const testType = String(test.testType ?? test.test_type ?? 'subject_wise').trim() || 'subject_wise';
  const courseId = test.courseId ?? test.course_id;

  return {
    course_id: courseId != null && courseId !== '' ? String(courseId) : '',
    title: test.title ?? '',
    description: test.description ?? '',
    category: test.category ?? 'MDCAT',
    test_type: testType,
    subject_id: testType === 'subject_wise' && subjectIds.length ? String(subjectIds[0]) : '',
    subject_ids: testType === 'mixed_subject' ? subjectIds : [],
  };
}

export function isTestPublishedStatus(status) {
  return String(status ?? '').toLowerCase() === 'published';
}

/**
 * @param {ReturnType<createDefaultTestBasicInfoForm>} form
 * @param {Parameters<typeof validateTestBasicInfoForm>[1]} [options]
 */
export function isTestBasicInfoFormReady(form, options = {}) {
  return validateTestBasicInfoForm(form, options).ok;
}
