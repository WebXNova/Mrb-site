/**
 * @file Editor workspace state model — authoring UI architecture.
 *
 * COMPONENT HIERARCHY
 * ───────────────────
 * CreateQuestionPage
 *   EditorRibbonProvider (command bus + formula dialog)
 *     qaw-shell
 *       TopActionBar
 *       EditorRibbon
 *       QuestionAuthoringWorkspace
 *         DocumentCanvas
 *           QuestionStemEditor → RichTextEditorHost (editorId: question)
 *           OptionsSection → OptionsBuilder
 *           ExplanationSection → RichTextEditorHost (editorId: explanation)
 *       StudentPreviewModal → StudentPreviewPanel → SanitizedBlockRenderer
 *
 * EDITOR STATE MODEL
 * ──────────────────
 * Reducer-owned (useCreateQuestionState):
 *   question.textHtmlDraft  — sanitized HTML; images inline as <img src="…">
 *   question.textPlain      — plain mirror for search/validation
 *   options                 — A–D MCQ map
 *   explanation.*           — same shape as question
 *   ui.isDirty, ui.errors, ui.previewVisible
 *
 * Ribbon-owned (EditorRibbonProvider — UI only):
 *   activeEditorId          — 'question' | 'explanation'
 *   editors Map             — CKEditor instances by id
 *   toggleState             — derived from CKEditor commands
 *
 * IMAGE INSERTION
 * ───────────────
 * Ribbon "Insert image" → file picker → uploadImage() → validate URL
 *   → editor.execute('insertImage', { source }) → inline <img> in textHtmlDraft
 *   → onChange → sanitizeEditorOutput() strips invalid src attributes
 *   → preview: parseQuestionPreviewBlocks() → validated <img> only
 *
 * RENDERING STRATEGY
 * ──────────────────
 * Authoring: CKEditor controlled via RichTextEditorHost (toolbar hidden)
 * Preview:    useStudentPreviewModel → StudentPreviewPanel — block parser, no dangerouslySetInnerHTML
 * Submit:     sanitizeBeforeSubmit + validateQuestionContent (future save)
 *
 * VALIDATION STRATEGY
 * ───────────────────
 * Every onChange: sanitizeEditorOutput / sanitizeExplanationHtml
 * Preview gate:   validateQuestionContent → sanitizedHtml → parseQuestionPreviewBlocks
 * Images:         validateImageUrl in DOMPurify hook + preview resolver
 * Formulas:       sanitizeFormulaLatex before insert; ⟦…⟧ markers in plain text
 */

export {};
