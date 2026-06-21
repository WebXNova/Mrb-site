import { useCallback, useMemo, useRef, useState } from 'react';
import { getRibbonCommand } from './ribbon.commands.js';
import { insertFormulaIntoEditor } from '../utils/formula/insertFormulaIntoEditor.js';

/**
 * @typedef {'question' | 'explanation' | `option:${string}`} RibbonFocusTarget
 */

/**
 * Command bus — ribbon controls editors through whitelisted commands only.
 *
 * @param {{ onOptionImageCommit?: (key: string, url: string) => void }} [options]
 */
export function useRibbonCommandBus({ onOptionImageCommit } = {}) {
  const editorsRef = useRef(new Map());
  const [activeEditorId, setActiveEditorId] = useState('question');
  /** @type {[RibbonFocusTarget, Function]} */
  const [focusTarget, setFocusTarget] = useState('question');
  const [formulaDialogOpen, setFormulaDialogOpen] = useState(false);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);

  const registerEditor = useCallback((editorId, editor) => {
    editorsRef.current.set(editorId, editor);
  }, []);

  const unregisterEditor = useCallback((editorId) => {
    editorsRef.current.delete(editorId);
  }, []);

  const getActiveEditor = useCallback(() => {
    if (focusTarget.startsWith('option:')) return null;
    const editorKey = focusTarget === 'explanation' ? 'explanation' : 'question';
    return editorsRef.current.get(editorKey) ?? null;
  }, [focusTarget]);

  const getFocusTargetLabel = useCallback(() => {
    if (focusTarget.startsWith('option:')) {
      return `Option ${focusTarget.split(':')[1]}`;
    }
    if (focusTarget === 'explanation') return 'Explanation';
    return 'Question';
  }, [focusTarget]);

  const queryCommand = useCallback(
    (commandId) => {
      const def = getRibbonCommand(commandId);
      const editor = getActiveEditor();
      if (!def || def.type !== 'editor' || !def.ckCommand || !editor) {
        return { isEnabled: false, isOn: false, value: null };
      }
      const command = editor.commands.get(def.ckCommand);
      if (!command) {
        return { isEnabled: false, isOn: false, value: null };
      }
      return {
        isEnabled: command.isEnabled,
        isOn: Boolean(command.value),
        value: command.value ?? null,
      };
    },
    [getActiveEditor]
  );

  const commitImage = useCallback(
    (url) => {
      if (focusTarget.startsWith('option:')) {
        const key = focusTarget.split(':')[1];
        onOptionImageCommit?.(key, url);
        setImagePopoverOpen(false);
        return { ok: true };
      }

      const editorKey = focusTarget === 'explanation' ? 'explanation' : 'question';
      const editor = editorsRef.current.get(editorKey);
      if (editor) {
        editor.execute('insertImage', { source: url });
        editor.editing.view.focus();
      }
      setImagePopoverOpen(false);
      return { ok: true };
    },
    [focusTarget, onOptionImageCommit]
  );

  const executeCommand = useCallback(
    (commandId, extra = {}) => {
      const def = getRibbonCommand(commandId);
      if (!def) return { ok: false, reason: 'unknown_command' };

      if (def.type === 'app') {
        if (commandId === 'insertFormula') {
          setFormulaDialogOpen(true);
          return { ok: true };
        }
        if (commandId === 'insertImage') {
          setImagePopoverOpen(true);
          return { ok: true };
        }
        return { ok: false, reason: 'unhandled_app_command' };
      }

      const editor = getActiveEditor();
      if (!editor) return { ok: false, reason: 'no_editor' };

      const options = { ...def.ckOptions, ...extra };
      const hasOptions = Object.keys(options).length > 0;
      editor.execute(def.ckCommand, hasOptions ? options : undefined);
      editor.editing.view.focus();
      return { ok: true };
    },
    [getActiveEditor]
  );

  const submitFormula = useCallback(
    (latex) => {
      const editor = getActiveEditor();
      const result = insertFormulaIntoEditor(editor, latex);
      if (result.ok) {
        setFormulaDialogOpen(false);
      }
      return result;
    },
    [getActiveEditor]
  );

  const closeFormulaDialog = useCallback(() => {
    setFormulaDialogOpen(false);
  }, []);

  const closeImagePopover = useCallback(() => {
    setImagePopoverOpen(false);
  }, []);

  const setEditorFocus = useCallback((editorId) => {
    setActiveEditorId(editorId);
    setFocusTarget(editorId === 'explanation' ? 'explanation' : 'question');
  }, []);

  const setOptionFocus = useCallback((optionKey) => {
    setFocusTarget(`option:${optionKey}`);
  }, []);

  return useMemo(
    () => ({
      activeEditorId,
      focusTarget,
      setActiveEditorId: setEditorFocus,
      setOptionFocus,
      registerEditor,
      unregisterEditor,
      getActiveEditor,
      getFocusTargetLabel,
      queryCommand,
      executeCommand,
      formulaDialogOpen,
      imagePopoverOpen,
      submitFormula,
      closeFormulaDialog,
      closeImagePopover,
      commitImage,
    }),
    [
      activeEditorId,
      focusTarget,
      setEditorFocus,
      setOptionFocus,
      registerEditor,
      unregisterEditor,
      getActiveEditor,
      getFocusTargetLabel,
      queryCommand,
      executeCommand,
      formulaDialogOpen,
      imagePopoverOpen,
      submitFormula,
      closeFormulaDialog,
      closeImagePopover,
      commitImage,
    ]
  );
}
