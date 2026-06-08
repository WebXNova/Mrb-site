import {
  MAX_QUESTION_TOPIC_LENGTH,
  MIN_QUESTION_MARKS,
  QUESTION_DIFFICULTY_OPTIONS,
} from '../constants/questionBank.constants.js';

/**
 * Question Information card for the Create Question page (Phase 1 metadata only).
 */
export default function QuestionInformationSection({
  form,
  courses,
  subjects,
  isLoadingCourses,
  coursesError,
  isLoadingSubjects,
  subjectsError,
  getFieldError,
  showError,
  onChange,
  onBlur,
  disabled = false,
}) {
  const topicLength = String(form.topic ?? '').length;
  const courseSelected = Boolean(form.course_id);
  const fieldsDisabled = disabled || isLoadingCourses || Boolean(coursesError);

  return (
    <section className="admin-card" aria-labelledby="question-information-heading">
      <h2 id="question-information-heading" className="heading-4">
        Question Information
      </h2>

      {coursesError ? <p className="admin-error" style={{ marginTop: '0.75rem' }}>{coursesError}</p> : null}
      {subjectsError && courseSelected ? (
        <p className="admin-error" style={{ marginTop: '0.75rem' }}>{subjectsError}</p>
      ) : null}

      <div className="admin-form-grid" style={{ marginTop: 'var(--space-4)' }}>
        <div className="admin-field">
          <label htmlFor="course_id">
            Course <span aria-hidden="true">*</span>
          </label>
          <select
            id="course_id"
            name="course_id"
            value={form.course_id}
            onChange={onChange}
            onBlur={onBlur}
            required
            disabled={fieldsDisabled}
            aria-invalid={showError('course_id')}
            aria-describedby={showError('course_id') ? 'course_id-error' : undefined}
          >
            <option value="">{isLoadingCourses ? 'Loading courses…' : 'Select course'}</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title || `Course #${course.id}`}
              </option>
            ))}
          </select>
          {showError('course_id') ? (
            <div id="course_id-error" className="admin-field__error" role="alert">
              {getFieldError('course_id')}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="subject_id">
            Subject <span aria-hidden="true">*</span>
          </label>
          <select
            id="subject_id"
            name="subject_id"
            value={form.subject_id}
            onChange={onChange}
            onBlur={onBlur}
            required
            disabled={fieldsDisabled || !courseSelected || isLoadingSubjects}
            aria-invalid={showError('subject_id')}
            aria-describedby={showError('subject_id') ? 'subject_id-error' : undefined}
          >
            <option value="">
              {!courseSelected
                ? 'Select a course first'
                : isLoadingSubjects
                  ? 'Loading subjects…'
                  : subjects.length
                    ? 'Select subject'
                    : 'No subjects for this course'}
            </option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name || subject.title || `Subject #${subject.id}`}
              </option>
            ))}
          </select>
          {showError('subject_id') ? (
            <div id="subject_id-error" className="admin-field__error" role="alert">
              {getFieldError('subject_id')}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="topic">Topic</label>
          <input
            id="topic"
            name="topic"
            type="text"
            value={form.topic}
            onChange={onChange}
            onBlur={onBlur}
            maxLength={MAX_QUESTION_TOPIC_LENGTH}
            autoComplete="off"
            disabled={fieldsDisabled}
            aria-invalid={showError('topic')}
            aria-describedby={showError('topic') ? 'topic-error' : 'topic-hint'}
          />
          <div id="topic-hint" className="admin-field__hint">
            {topicLength} / {MAX_QUESTION_TOPIC_LENGTH} (optional)
          </div>
          {showError('topic') ? (
            <div id="topic-error" className="admin-field__error" role="alert">
              {getFieldError('topic')}
            </div>
          ) : null}
        </div>

        <div className="admin-field">
          <label htmlFor="difficulty">Difficulty</label>
          <select
            id="difficulty"
            name="difficulty"
            value={form.difficulty}
            onChange={onChange}
            onBlur={onBlur}
            disabled={fieldsDisabled}
          >
            {QUESTION_DIFFICULTY_OPTIONS.map((option) => (
              <option key={option.value || 'none'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="admin-field">
          <label htmlFor="marks">
            Marks <span aria-hidden="true">*</span>
          </label>
          <input
            id="marks"
            name="marks"
            type="number"
            inputMode="decimal"
            min={MIN_QUESTION_MARKS}
            step="0.01"
            value={form.marks}
            onChange={onChange}
            onBlur={onBlur}
            required
            disabled={fieldsDisabled}
            aria-invalid={showError('marks')}
            aria-describedby={showError('marks') ? 'marks-error' : 'marks-hint'}
          />
          <div id="marks-hint" className="admin-field__hint">
            Decimal values supported (minimum {MIN_QUESTION_MARKS})
          </div>
          {showError('marks') ? (
            <div id="marks-error" className="admin-field__error" role="alert">
              {getFieldError('marks')}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
