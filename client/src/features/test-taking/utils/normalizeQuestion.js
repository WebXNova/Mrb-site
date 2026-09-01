import { buildPresentationSettings } from '../../../utils/testPresentation.js';

/** @param {Record<string, unknown>|null|undefined} raw */
export function normalizeAttemptQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id ?? raw.questionId ?? raw.question_id;
  if (id == null) return null;

  const questionText =
    raw.questionText ?? raw.question_text ?? raw.questionHtml ?? raw.question_html ?? '';
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions
    .map((option) => ({
      id: option.id ?? option.optionId ?? option.option_id,
      text: option.text ?? option.optionText ?? option.option_text ?? '',
    }))
    .filter((option) => option.id != null);

  const sectionId = raw.sectionId ?? raw.section_id ?? null;
  const tipHtml = raw.tipHtml ?? raw.tip_html ?? null;

  return {
    id: String(id),
    questionText,
    questionImageUrl: raw.questionImageUrl ?? raw.question_image_url ?? null,
    sectionId: sectionId == null ? null : String(sectionId),
    tipHtml: tipHtml && String(tipHtml).trim() ? String(tipHtml) : null,
    options,
  };
}

/** @param {Record<string, unknown>|null|undefined} section */
export function normalizeAttemptSection(section) {
  if (!section || typeof section !== 'object') return null;
  const id = section.id ?? section.sectionId ?? section.section_id;
  if (id == null) return null;
  return {
    id: Number(id),
    subjectLabel: String(section.subjectLabel ?? section.subject_label ?? ''),
    dividerContentHtml:
      section.dividerContentHtml ?? section.divider_content_html ?? null,
    displayOrder: Number(section.displayOrder ?? section.display_order ?? 0),
  };
}

/** @param {unknown[]} sections */
export function normalizeAttemptSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map(normalizeAttemptSection).filter(Boolean);
}

/** @param {Record<string, unknown>|null|undefined} test */
export function normalizeTestDisplaySettings(test) {
  return buildPresentationSettings(test);
}

/** @param {unknown[]} questions */
export function normalizeAttemptQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  return questions.map(normalizeAttemptQuestion).filter(Boolean);
}

/** @param {Record<string, unknown>|null|undefined} saved */
export function normalizeSavedAnswers(saved) {
  if (!saved || typeof saved !== 'object') return {};
  const out = {};
  for (const [key, value] of Object.entries(saved)) {
    out[String(key)] = value == null ? null : String(value);
  }
  return out;
}
