import { useEffect, useState } from 'react';
import { RIBBON_COMMANDS } from './ribbon.commands.js';

const TOGGLE_COMMAND_IDS = RIBBON_COMMANDS.filter((c) => c.isToggle).map((c) => c.id);

/**
 * Sync toggle button state from active CKEditor commands.
 *
 * @param {import('./useRibbonCommandBus.js').useRibbonCommandBus} bus
 */
export function useRibbonCommandState(bus) {
  const [toggleState, setToggleState] = useState({});

  useEffect(() => {
    const editor = bus.getActiveEditor();
    if (!editor?.model?.document) {
      setToggleState({});
      return undefined;
    }

    function refresh() {
      const next = {};
      for (const id of TOGGLE_COMMAND_IDS) {
        next[id] = bus.queryCommand(id);
      }
      setToggleState(next);
    }

    refresh();
    editor.model.document.on('change:data', refresh);
    editor.model.document.selection.on('change', refresh);

    return () => {
      editor.model.document.off('change:data', refresh);
      editor.model.document.selection.off('change', refresh);
    };
  }, [bus, bus.focusTarget]);

  return toggleState;
}
