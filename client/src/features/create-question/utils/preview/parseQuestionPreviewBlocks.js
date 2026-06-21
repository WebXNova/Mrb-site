import { FORMULA_PATTERN } from '../formula/formulaDelimiters.js';
import { validateImageUrl } from '../image/validateImageUrl.js';
import { toSafePreviewText } from '../previewText.js';

/**
 * @typedef {'text' | 'image' | 'formula' | 'table' | 'break'} PreviewBlockType
 */

/**
 * @typedef {Object} TextPreviewBlock
 * @property {'text'} type
 * @property {string} text
 */

/**
 * @typedef {Object} ImagePreviewBlock
 * @property {'image'} type
 * @property {string} src
 * @property {string} alt
 */

/**
 * @typedef {Object} FormulaPreviewBlock
 * @property {'formula'} type
 * @property {string} latex
 */

/**
 * @typedef {Object} TablePreviewBlock
 * @property {'table'} type
 * @property {string[][]} rows
 */

/**
 * @typedef {TextPreviewBlock | ImagePreviewBlock | FormulaPreviewBlock | TablePreviewBlock} PreviewBlock
 */

/**
 * Parse sanitized question HTML into safe preview blocks.
 * Never executes raw HTML — only extracts validated primitives.
 *
 * @param {string} sanitizedHtml
 * @returns {PreviewBlock[]}
 */
export function parseQuestionPreviewBlocks(sanitizedHtml) {
  const html = String(sanitizedHtml ?? '').trim();
  if (!html) return [];

  const blocks = /** @type {PreviewBlock[]} */ ([]);

  if (typeof DOMParser === 'undefined') {
    const plain = toSafePreviewText(html);
    if (plain) blocks.push({ type: 'text', text: plain });
    return blocks;
  }

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return blocks;

  walkNodes(root, blocks);
  return mergeAdjacentTextBlocks(blocks);
}

/**
 * @param {Element} node
 * @param {PreviewBlock[]} blocks
 */
function walkNodes(node, blocks) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      appendTextWithFormulas(String(child.textContent ?? ''), blocks);
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = /** @type {Element} */ (child);
    const tag = el.tagName.toLowerCase();

    if (tag === 'img') {
      const src = el.getAttribute('src') || '';
      const check = validateImageUrl(src, { allowEmpty: true });
      if (check.ok && check.url) {
        blocks.push({
          type: 'image',
          src: check.url,
          alt: toSafePreviewText(el.getAttribute('alt') || 'Question image'),
        });
      }
      continue;
    }

    if (tag === 'table') {
      const rows = parseTableRows(el);
      if (rows.length > 0) {
        blocks.push({ type: 'table', rows });
      }
      continue;
    }

    if (tag === 'br') {
      blocks.push({ type: 'text', text: '\n' });
      continue;
    }

    if (isBlockElement(tag)) {
      if (blocks.length > 0) {
        const last = blocks[blocks.length - 1];
        if (last.type !== 'text' || !last.text.endsWith('\n')) {
          blocks.push({ type: 'text', text: '\n' });
        }
      }
    }

    walkNodes(el, blocks);
  }
}

/**
 * @param {string} text
 * @param {PreviewBlock[]} blocks
 */
function appendTextWithFormulas(text, blocks) {
  let lastIndex = 0;
  const pattern = new RegExp(FORMULA_PATTERN.source, 'g');
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      blocks.push({ type: 'text', text: before });
    }
    blocks.push({ type: 'formula', latex: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) {
    blocks.push({ type: 'text', text: tail });
  }
}

/**
 * @param {Element} table
 * @returns {string[][]}
 */
function parseTableRows(table) {
  const rows = [];
  for (const row of table.querySelectorAll('tr')) {
    const cells = [];
    for (const cell of row.querySelectorAll('th, td')) {
      cells.push(toSafePreviewText(cell.textContent || ''));
    }
    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }
  return rows;
}

/**
 * @param {string} tag
 */
function isBlockElement(tag) {
  return ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figure'].includes(
    tag
  );
}

/**
 * @param {PreviewBlock[]} blocks
 * @returns {PreviewBlock[]}
 */
function mergeAdjacentTextBlocks(blocks) {
  const merged = /** @type {PreviewBlock[]} */ ([]);
  for (const block of blocks) {
    if (block.type === 'text') {
      const text = block.text.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const last = merged[merged.length - 1];
      if (last?.type === 'text') {
        last.text = `${last.text} ${text}`.trim();
      } else {
        merged.push({ type: 'text', text });
      }
    } else {
      merged.push(block);
    }
  }
  return merged;
}
