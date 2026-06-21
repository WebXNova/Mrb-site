import { useQuizAikenFileImport } from '../hooks/useQuizAikenFileImport.js';
import { AIKEN_DRAFT_LOAD_BUTTON, AIKEN_DRAFT_LOADING_BUTTON } from '../utils/aikenDraftImportCopy.js';

/**
 * @param {{
 *   existingQuestions: import('../types/quizBuilder.types.js').QuizQuestion[],
 *   onImported: (questions: import('../types/quizBuilder.types.js').QuizQuestion[]) => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function QuizAikenImportButton({
  existingQuestions,
  onImported,
  disabled = false,
  className = 'btn btn--secondary qb-page__import-btn',
}) {
  const { importing, openFilePicker, inputRef, handleFileSelected, accept } = useQuizAikenFileImport({
    existingQuestions,
    onImported,
    disabled,
  });

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileSelected}
      />
      <button
        type="button"
        className={className}
        onClick={openFilePicker}
        disabled={disabled || importing}
        aria-busy={importing}
        title="Loads questions into this test draft only — not the shared question bank"
      >
        {importing ? AIKEN_DRAFT_LOADING_BUTTON : AIKEN_DRAFT_LOAD_BUTTON}
      </button>
    </>
  );
}
