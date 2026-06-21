/**
 * @file Student Preview — architecture types.
 *
 * PREVIEW ARCHITECTURE
 * ────────────────────
 * Authoring state (reducer)
 *   → buildStudentPreviewModel()   [sanitize + parse, pure]
 *   → StudentPreviewModel          [immutable DTO]
 *   → StudentPreviewPanel          [presentational, no raw HTML]
 *
 * SYNCHRONIZATION
 * ───────────────
 * useStudentPreviewModel(state) memoizes on question/options/explanation slices.
 * Every reducer update re-derives the model synchronously — no refresh button,
 * no debounce, no polling.
 *
 * RENDERING STRATEGY
 * ──────────────────
 * Question/Explanation: block renderer (text | image | table | formula)
 * Options: disabled radio + letter marker + plain text + validated <img>
 * Never: dangerouslySetInnerHTML, raw textHtmlDraft, unvalidated URLs
 *
 * SECURITY
 * ────────
 * - validateQuestionContent + sanitizeExplanationHtml before parse
 * - parseQuestionPreviewBlocks extracts only whitelisted primitives
 * - image src resolved through validateImageUrl / validateOptionImageUrl
 * - Student view hides correct-answer markers (matches live test UX)
 */

/**
 * @typedef {import('../utils/preview/parseQuestionPreviewBlocks.js').PreviewBlock} PreviewBlock
 */

/**
 * @typedef {Object} StudentPreviewOption
 * @property {string} key
 * @property {string} label
 * @property {string} text
 * @property {string} imagePreviewSrc — empty when invalid
 * @property {boolean} hasImage
 */

/**
 * @typedef {Object} StudentPreviewModel
 * @property {{ blocks: PreviewBlock[], isEmpty: boolean }} question
 * @property {StudentPreviewOption[]} options
 * @property {{ blocks: PreviewBlock[], isEmpty: boolean }} explanation
 * @property {{ builtAt: number, questionCharCount: number }} meta
 */

export {};
