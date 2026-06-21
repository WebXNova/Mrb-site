import OptionsBuilder from '../components/OptionsBuilder.jsx';

/**
 * Answer choices section — integrated into document flow, not a separate form page.
 */
export default function OptionsSection({
  options,
  errors,
  onOptionTextChange,
  onOptionImageChange,
  onCorrectOptionChange,
  onClearOptionImageError,
  disabled = false,
}) {
  return (
    <section className="qaw-options" aria-labelledby="qaw-options-heading">
      <h2 id="qaw-options-heading" className="qaw-section-title">
        Answer choices
      </h2>
      <p className="qaw-section-hint">
        Single-choice MCQ — mark one correct answer. Click an option field, then use{' '}
        <strong>Insert → Image</strong> in the toolbar to add an option image.
      </p>
      <OptionsBuilder
        embedded
        options={options}
        errors={errors}
        onOptionTextChange={onOptionTextChange}
        onOptionImageChange={onOptionImageChange}
        onCorrectOptionChange={onCorrectOptionChange}
        onClearOptionImageError={onClearOptionImageError}
        disabled={disabled}
      />
    </section>
  );
}
