import {
  courseWizardCourseSchema,
  courseWizardPricingSchema,
  courseWizardBatchItemSchema,
  courseWizardSubjectItemSchema,
} from '@course-wizard-schema';
import { sanitizeWizardBatch } from './courseWizardDefaults.js';
export function validateDetailsStep(course) {
  return courseWizardCourseSchema.safeParse(course);
}

export function validateAdmissionStep(course) {
  const status = String(course?.admission_status || 'CLOSED').trim().toUpperCase();
  if (!['OPEN', 'CLOSED'].includes(status)) {
    return {
      success: false,
      errors: { admission_status: 'Admission status must be OPEN or CLOSED' },
      message: 'Invalid admission status',
    };
  }
  return { success: true };
}

/** @deprecated Schedule step removed — admission lives on batch delivery. */
export function validateScheduleStep(course) {
  return validateAdmissionStep(course);
}

export function validatePricingStep(pricing) {
  return courseWizardPricingSchema.safeParse(pricing);
}

export function validateBatchesStep(batches) {
  if (!Array.isArray(batches) || batches.length === 0) {
    return { success: true, data: batches };
  }
  for (let i = 0; i < batches.length; i += 1) {
    const r = courseWizardBatchItemSchema.safeParse(sanitizeWizardBatch(batches[i]));
    if (!r.success) return { success: false, index: i, error: r.error };
  }
  return { success: true, data: batches };
}

export function validateSubjectsStep(subjects) {
  if (!Array.isArray(subjects)) {
    return { success: true, data: subjects };
  }
  const filled = subjects
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => String(s.title || '').trim());
  const titles = filled.map(({ s }) => String(s.title).trim().toLowerCase());
  const seen = new Set();
  for (let k = 0; k < titles.length; k += 1) {
    if (seen.has(titles[k])) {
      return { success: false, index: filled[k].i, duplicateTitle: true };
    }
    seen.add(titles[k]);
  }
  for (const { s, i } of filled) {
    const r = courseWizardSubjectItemSchema.safeParse({ ...s, order_index: s.order_index ?? i });
    if (!r.success) return { success: false, index: i, error: r.error };
  }
  return { success: true, data: subjects };
}

export function flattenZodError(err) {
  const f = err?.flatten?.();
  if (!f) return err?.message || 'Validation failed';
  const field = f.fieldErrors ? Object.entries(f.fieldErrors).find(([, v]) => v && v.length) : null;
  if (field) return `${field[0]}: ${field[1][0]}`;
  const form = f.formErrors?.[0];
  return form || 'Validation failed';
}
