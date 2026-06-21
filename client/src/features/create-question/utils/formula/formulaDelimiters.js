/** Unicode formula markers — survive CKEditor plain-text model without custom plugins. */
export const FORMULA_OPEN = '⟦';
export const FORMULA_CLOSE = '⟧';
export const FORMULA_PATTERN = /⟦([^⟧]{1,500})⟧/g;

/**
 * @param {string} latex
 * @returns {string}
 */
export function wrapFormulaMarker(latex) {
  const inner = String(latex ?? '').trim();
  if (!inner) return '';
  return `${FORMULA_OPEN}${inner}${FORMULA_CLOSE}`;
}
