import MetadataSection from './MetadataSection.jsx';
import QuestionEditor from './QuestionEditor.jsx';
import ImageInputComponent from './ImageInputComponent.jsx';
import OptionsBuilder from './OptionsBuilder.jsx';
import ExplanationEditor from './ExplanationEditor.jsx';
import { prepareForPreview } from '../utils/prepareForPreview.js';

/**
 * Left column — all authoring inputs.
 * Receives state slices + action callbacks; no internal global state.
 */
export default function LeftEditorPanel({
  metadata,
  question,
  questionImage,
  options,
  explanation,
  errors,
  actions,
  disabled = false,
}) {
  return (
    <div className="cq-editor-panel">
      <MetadataSection
        metadata={metadata}
        errors={errors}
        onMetadataChange={actions.setMetadataField}
        disabled={disabled}
      />
      <QuestionEditor
        question={question}
        error={errors.questionText}
        onQuestionChange={actions.setQuestionText}
        disabled={disabled}
      />
      <ImageInputComponent
        imageUrl={questionImage.url}
        imageSource={questionImage.source}
        error={errors.questionImage}
        onImageCommitted={actions.setQuestionImage}
        onImageRemoved={actions.removeQuestionImage}
        onClearError={() => actions.clearFieldError('questionImage')}
        disabled={disabled}
      />
      <OptionsBuilder
        options={options}
        errors={errors}
        onOptionTextChange={actions.updateOptionText}
        onOptionImageChange={actions.updateOptionImage}
        onCorrectOptionChange={actions.setCorrectOption}
        onClearOptionImageError={(key) => actions.clearFieldError(`option_${key}_image`)}
        disabled={disabled}
      />
      <ExplanationEditor
        value={explanation.textHtmlDraft}
        onChange={(cleanHtml) =>
          actions.setExplanationText(prepareForPreview(cleanHtml), cleanHtml)
        }
        error={errors.explanation}
        disabled={disabled}
      />
    </div>
  );
}
