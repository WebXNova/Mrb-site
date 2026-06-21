/**
 * Whitelisted ribbon command registry.
 * Ribbon never passes arbitrary strings to editor.execute().
 */

/** @typedef {'editor' | 'app'} RibbonCommandType */

/**
 * @typedef {Object} RibbonCommandDef
 * @property {string} id
 * @property {RibbonCommandType} type
 * @property {string} [ckCommand]
 * @property {Record<string, unknown>} [ckOptions]
 * @property {string} label
 * @property {string} [shortcut]
 * @property {boolean} [isToggle]
 * @property {string} [group]
 */

/** @type {RibbonCommandDef[]} */
export const RIBBON_COMMANDS = [
  { id: 'bold', type: 'editor', ckCommand: 'bold', label: 'Bold', shortcut: 'Ctrl+B', isToggle: true, group: 'text' },
  { id: 'italic', type: 'editor', ckCommand: 'italic', label: 'Italic', shortcut: 'Ctrl+I', isToggle: true, group: 'text' },
  { id: 'underline', type: 'editor', ckCommand: 'underline', label: 'Underline', shortcut: 'Ctrl+U', isToggle: true, group: 'text' },
  { id: 'superscript', type: 'editor', ckCommand: 'superscript', label: 'Superscript', isToggle: true, group: 'text' },
  { id: 'subscript', type: 'editor', ckCommand: 'subscript', label: 'Subscript', isToggle: true, group: 'text' },
  { id: 'alignment:left', type: 'editor', ckCommand: 'alignment', ckOptions: { value: 'left' }, label: 'Align left', group: 'paragraph' },
  { id: 'alignment:center', type: 'editor', ckCommand: 'alignment', ckOptions: { value: 'center' }, label: 'Align center', group: 'paragraph' },
  { id: 'alignment:right', type: 'editor', ckCommand: 'alignment', ckOptions: { value: 'right' }, label: 'Align right', group: 'paragraph' },
  { id: 'alignment:justify', type: 'editor', ckCommand: 'alignment', ckOptions: { value: 'justify' }, label: 'Justify', group: 'paragraph' },
  { id: 'bulletedList', type: 'editor', ckCommand: 'bulletedList', label: 'Bulleted list', shortcut: 'Ctrl+Shift+L', isToggle: true, group: 'paragraph' },
  { id: 'numberedList', type: 'editor', ckCommand: 'numberedList', label: 'Numbered list', shortcut: 'Ctrl+Shift+O', isToggle: true, group: 'paragraph' },
  { id: 'outdent', type: 'editor', ckCommand: 'outdent', label: 'Decrease indent', group: 'paragraph' },
  { id: 'indent', type: 'editor', ckCommand: 'indent', label: 'Increase indent', group: 'paragraph' },
  { id: 'insertTable', type: 'editor', ckCommand: 'insertTable', ckOptions: { rows: 3, columns: 3 }, label: 'Insert table', group: 'insert' },
  { id: 'insertFormula', type: 'app', label: 'Insert formula', group: 'insert' },
  { id: 'insertImage', type: 'app', label: 'Insert image', group: 'insert' },
  { id: 'undo', type: 'editor', ckCommand: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', group: 'actions' },
  { id: 'redo', type: 'editor', ckCommand: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', group: 'actions' },
];

/** @type {Map<string, RibbonCommandDef>} */
export const RIBBON_COMMAND_MAP = new Map(RIBBON_COMMANDS.map((cmd) => [cmd.id, cmd]));

/**
 * @param {string} id
 * @returns {RibbonCommandDef | undefined}
 */
export function getRibbonCommand(id) {
  return RIBBON_COMMAND_MAP.get(id);
}
