import { wrapFormulaMarker } from './formulaDelimiters.js';
import { sanitizeFormulaLatex } from './sanitizeFormulaLatex.js';

/**
 * Insert a formula marker into the active CKEditor instance.
 * Uses plain-text delimiters — no raw HTML injection.
 *
 * @param {import('ckeditor5').Editor | null | undefined} editor
 * @param {string} latex
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function insertFormulaIntoEditor(editor, latex) {
  if (!editor || editor.isReadOnly) {
    return { ok: false, message: 'Editor is not available.' };
  }

  const check = sanitizeFormulaLatex(latex);
  if (!check.ok) {
    return { ok: false, message: check.message };
  }

  const marker = wrapFormulaMarker(check.latex);
  editor.model.change((writer) => {
    const position = editor.model.document.selection.getFirstPosition();
    if (!position) return;
    writer.insertText(` ${marker} `, position);
  });

  editor.editing.view.focus();
  return { ok: true };
}
