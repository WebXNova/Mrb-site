import DocumentCanvas from './DocumentCanvas.jsx';
import QuestionStemEditor from './QuestionStemEditor.jsx';
import OptionsSection from './OptionsSection.jsx';
import ExplanationSection from './ExplanationSection.jsx';

/**
 * Question Authoring Workspace — editor-first layout (Word / Docs / Notion).
 * No metadata selectors; no separate question-image panel — images live in the stem editor.
 */
export default function QuestionAuthoringWorkspace({
  question,
  options,
  explanation,
  errors = {},
  actions,
  disabled = false,
}) {
  return (
    <div className="qaw-workspace">
      <DocumentCanvas>
        <QuestionStemEditor
          question={question}
          error={errors.questionText || ''}
          onQuestionChange={actions.setQuestionText}
          disabled={disabled}
        />

        <OptionsSection
          options={options}
          errors={errors}
          onOptionTextChange={actions.updateOptionText}
          onOptionImageChange={actions.updateOptionImage}
          onCorrectOptionChange={actions.setCorrectOption}
          onClearOptionImageError={(key) => actions.clearFieldError(`option_${key}_image`)}
          disabled={disabled}
        />

        <ExplanationSection
          explanation={explanation}
          error={errors.explanation || ''}
          onExplanationChange={actions.setExplanationText}
          disabled={disabled}
        />
      </DocumentCanvas>
    </div>
  );
}
