import {
  MAX_QUESTION_TOPIC_LENGTH,
  MIN_QUESTION_MARKS,
  QUESTION_DIFFICULTY_OPTIONS,
} from '../../../admin/constants/questionBank.constants.js';

/**
 * Metadata inputs — controlled props only; no internal global state.
 * Course/subject options are placeholders until API layer is connected.
 */
export default function MetadataSection({
  metadata,
  errors = {},
  onMetadataChange,
  disabled = false,
}) {
  const topicLength = String(metadata.topic ?? '').length;

  function handleChange(event) {
    const { name, value } = event.target;
    onMetadataChange(name, name === 'marks' ? Number(value) : value);
  }

  return (
    <section className="admin-card cq-section" aria-labelledby="cq-metadata-heading">
      <h2 id="cq-metadata-heading" className="heading-4">
        Metadata
      </h2>
      <p className="admin-field__hint cq-section__hint">
        Course and subject lists will load from API in a later phase.
      </p>

      <div className="admin-form-grid cq-metadata-grid">
        <div className="admin-field">
          <label htmlFor="cq-course-id">
            Course <span aria-hidden="true">*</span>
          </label>
          <select
            id="cq-course-id"
            name="courseId"
            value={metadata.courseId}
            onChange={handleChange}
            disabled={disabled}
            aria-invalid={Boolean(errors.courseId)}
          >
            <option value="">Select course (placeholder)</option>
            <option value="placeholder-1">Sample course A</option>
            <option value="placeholder-2">Sample course B</option>
          </select>
          {errors.courseId ? (
            <div className="admin-field__error" role="alert">
              {errors.courseId}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="cq-subject-id">
            Subject <span aria-hidden="true">*</span>
          </label>
          <select
            id="cq-subject-id"
            name="subjectId"
            value={metadata.subjectId}
            onChange={handleChange}
            disabled={disabled || !metadata.courseId}
            aria-invalid={Boolean(errors.subjectId)}
          >
            <option value="">Select subject (placeholder)</option>
            <option value="placeholder-s1">Sample subject 1</option>
            <option value="placeholder-s2">Sample subject 2</option>
          </select>
          {errors.subjectId ? (
            <div className="admin-field__error" role="alert">
              {errors.subjectId}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="cq-topic">Topic</label>
          <input
            id="cq-topic"
            name="topic"
            type="text"
            maxLength={MAX_QUESTION_TOPIC_LENGTH}
            value={metadata.topic}
            onChange={handleChange}
            disabled={disabled}
            placeholder="Optional topic"
          />
          <small className="admin-field__hint">
            {topicLength}/{MAX_QUESTION_TOPIC_LENGTH}
          </small>
        </div>

        <div className="admin-field">
          <label htmlFor="cq-difficulty">Difficulty</label>
          <select
            id="cq-difficulty"
            name="difficulty"
            value={metadata.difficulty}
            onChange={handleChange}
            disabled={disabled}
          >
            {QUESTION_DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt.value || 'empty'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label htmlFor="cq-marks">
            Marks <span aria-hidden="true">*</span>
          </label>
          <input
            id="cq-marks"
            name="marks"
            type="number"
            min={MIN_QUESTION_MARKS}
            step="0.01"
            value={metadata.marks}
            onChange={handleChange}
            disabled={disabled}
            aria-invalid={Boolean(errors.marks)}
          />
          {errors.marks ? (
            <div className="admin-field__error" role="alert">
              {errors.marks}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <span className="admin-field__label-block">Question type</span>
          <p className="admin-stat-card__label">{metadata.questionType}</p>
        </div>
      </div>
    </section>
  );
}
