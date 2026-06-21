import { useEffect } from 'react';

const SHORTCUT_MAP = {
  'ctrl+b': 'bold',
  'ctrl+i': 'italic',
  'ctrl+u': 'underline',
  'ctrl+z': 'undo',
  'ctrl+y': 'redo',
  'ctrl+shift+z': 'redo',
  'ctrl+shift+l': 'bulletedList',
  'ctrl+shift+o': 'numberedList',
};

/**
 * @param {string} eventKey
 * @param {KeyboardEvent} event
 */
function shortcutKey(eventKey, event) {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('ctrl');
  if (event.shiftKey) parts.push('shift');
  parts.push(eventKey.toLowerCase());
  return parts.join('+');
}

/**
 * @param {{ executeCommand: (id: string) => void, enabled?: boolean }} options
 */
export function useRibbonShortcuts({ executeCommand, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined;

    function handleKeyDown(event) {
      const target = /** @type {HTMLElement} */ (event.target);
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable === false && target.closest('.ck-editor__editable') === null) {
        return;
      }

      const key = shortcutKey(event.key, event);
      const commandId = SHORTCUT_MAP[key];
      if (!commandId) return;

      event.preventDefault();
      executeCommand(commandId);
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [executeCommand, enabled]);
}
