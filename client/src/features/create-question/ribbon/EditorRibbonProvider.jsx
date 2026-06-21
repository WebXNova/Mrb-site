import { createContext, useContext, useMemo } from 'react';
import { useRibbonCommandBus } from './useRibbonCommandBus.js';
import { useRibbonCommandState } from './useRibbonCommandState.js';
import { useRibbonShortcuts } from './useRibbonShortcuts.js';
import FormulaInsertDialog from '../components/FormulaInsertDialog.jsx';
import ImageInsertPopover from './ImageInsertPopover.jsx';

const EditorRibbonContext = createContext(null);

export function EditorRibbonProvider({
  children,
  disabled = false,
  onOptionImageCommit,
}) {
  const bus = useRibbonCommandBus({ onOptionImageCommit });
  const toggleState = useRibbonCommandState(bus);

  useRibbonShortcuts({
    executeCommand: bus.executeCommand,
    enabled: !disabled,
  });

  const value = useMemo(
    () => ({
      ...bus,
      toggleState,
      disabled,
    }),
    [bus, toggleState, disabled]
  );

  const isOptionTarget = bus.focusTarget.startsWith('option:');

  return (
    <EditorRibbonContext.Provider value={value}>
      {children}
      <FormulaInsertDialog
        open={bus.formulaDialogOpen}
        onClose={bus.closeFormulaDialog}
        onSubmit={bus.submitFormula}
      />
      <ImageInsertPopover
        open={bus.imagePopoverOpen}
        targetLabel={bus.getFocusTargetLabel()}
        isOptionTarget={isOptionTarget}
        onClose={bus.closeImagePopover}
        onCommit={bus.commitImage}
      />
    </EditorRibbonContext.Provider>
  );
}

export function useEditorRibbon() {
  const ctx = useContext(EditorRibbonContext);
  if (!ctx) {
    throw new Error('useEditorRibbon must be used within EditorRibbonProvider');
  }
  return ctx;
}
