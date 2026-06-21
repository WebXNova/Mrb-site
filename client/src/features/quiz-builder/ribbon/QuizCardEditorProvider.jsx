import { createContext, useContext, useMemo } from 'react';
import FormulaInsertDialog from '../../create-question/components/FormulaInsertDialog.jsx';
import ImageInsertPopover from '../../create-question/ribbon/ImageInsertPopover.jsx';
import { useRibbonCommandState } from '../../create-question/ribbon/useRibbonCommandState.js';
import { useRibbonShortcuts } from '../../create-question/ribbon/useRibbonShortcuts.js';
import { useQuizCardRibbonBus } from './useQuizCardRibbonBus.js';

const QuizCardEditorContext = createContext(null);

export function QuizCardEditorProvider({ children, disabled = false }) {
  const bus = useQuizCardRibbonBus();
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

  return (
    <QuizCardEditorContext.Provider value={value}>
      {children}
      <FormulaInsertDialog
        open={bus.formulaDialogOpen}
        onClose={bus.closeFormulaDialog}
        onSubmit={bus.submitFormula}
      />
      <ImageInsertPopover
        open={bus.imagePopoverOpen}
        targetLabel={bus.getFocusTargetLabel()}
        isOptionTarget={false}
        onClose={bus.closeImagePopover}
        onCommit={bus.commitImage}
      />
    </QuizCardEditorContext.Provider>
  );
}

export function useQuizCardRibbon() {
  const ctx = useContext(QuizCardEditorContext);
  if (!ctx) {
    throw new Error('useQuizCardRibbon must be used within QuizCardEditorProvider');
  }
  return ctx;
}
