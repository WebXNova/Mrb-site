/** @param {Record<string, unknown>|null|undefined} raw */
export function normalizeAttemptQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = raw.id ?? raw.questionId ?? raw.question_id;
  if (id == null) return null;

  const questionText = raw.questionText ?? raw.question_text ?? '';
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions
    .map((option) => ({
      id: option.id ?? option.optionId ?? option.option_id,
      text: option.text ?? option.optionText ?? option.option_text ?? '',
    }))
    .filter((option) => option.id != null);

  return {
    id: String(id),
    questionText,
    questionImageUrl: raw.questionImageUrl ?? raw.question_image_url ?? null,
    options,
  };
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
