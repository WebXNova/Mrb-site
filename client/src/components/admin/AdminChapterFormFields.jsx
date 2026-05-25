/**
 * Shared chapter admin fields — duplicated ids prevented via `fieldIdPrefix`.
 *
 * Edit mode: Course and Subject are read-only display (no reassignment).
 */
import {
  CHAPTER_DESCRIPTION_MAX_UX,
  CHAPTER_TITLE_MAX_UX,
} from './chapterFormUtils';

/** @typedef {{ course?: string, subject?: string }} LockedTitles */

/**
 * @param {{
 *   variant: 'create' | 'edit',
 *   fieldIdPrefix: string,
 *   formState: { courseId?: string, subjectId?: string, title?: string, description?: string, orderIndex?: number, isActive?: boolean },
 *   onFormChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void,
 *   sortedCourses: Array<{ id?: unknown, title?: string }>,
 *   sortedFormSubjects: Array<{ id?: unknown, title?: string }>,
 *   isLoadingCourses: boolean,
 *   isLoadingFormSubjects: boolean,
 *   lockedTitles?: LockedTitles,
 *   courseControlDisabled: boolean,
 *   subjectSelectDisabled: boolean,
 *   fieldsDisabled: boolean,
 *   children?: React.ReactNode,
 * }} props
 */
export default function AdminChapterFormFields({
  variant,
  fieldIdPrefix,
  formState,
  onFormChange,
  sortedCourses,
  sortedFormSubjects,
  isLoadingCourses,
  isLoadingFormSubjects,
  lockedTitles,
  courseControlDisabled,
  subjectSelectDisabled,
  fieldsDisabled,
  children,
}) {
  const idCourse = `${fieldIdPrefix}Course`;
  const idSubject = `${fieldIdPrefix}Subject`;
  const idTitle = `${fieldIdPrefix}Title`;
  const idOrder = `${fieldIdPrefix}Order`;
  const idDesc = `${fieldIdPrefix}Description`;
  const idActive = `${fieldIdPrefix}Active`;

  const showHierarchyReadOnly = variant === 'edit';

  return (
    <>
      {showHierarchyReadOnly ? (
        <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
          <div className="admin-field--readonly-stack" aria-label="Chapter location">
            <dl className="admin-chapter-lock-dl">
              <div>
                <dt className="admin-field__readonly-muted">Course</dt>
                <dd>
                  {lockedTitles?.course?.trim() ? (
                    <>
                      {lockedTitles.course.trim()}{' '}
                      <span className="admin-field__readonly-muted">(locked)</span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              <div>
                <dt className="admin-field__readonly-muted">Subject</dt>
                <dd>
                  {lockedTitles?.subject?.trim() ? (
                    <>
                      {lockedTitles.subject.trim()}{' '}
                      <span className="admin-field__readonly-muted">(locked)</span>
                    </>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
            <p className="admin-field__readonly-muted" style={{ margin: 0, marginTop: '0.25rem' }}>
              Course and subject are fixed after creation to protect lecture ownership and hierarchy integrity.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="admin-field">
            <label htmlFor={idCourse}>Course</label>
            <select
              id={idCourse}
              name="courseId"
              value={formState.courseId}
              onChange={onFormChange}
              required
              disabled={courseControlDisabled || isLoadingCourses}
            >
              <option value="">
                {sortedCourses.length ? 'Select a course…' : 'No courses available'}
              </option>
              {sortedCourses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title} · #{course.id}
                </option>
              ))}
            </select>
          </div>

          <div className="admin-field">
            <label htmlFor={idSubject}>Subject</label>
            <select
              id={idSubject}
              name="subjectId"
              value={formState.subjectId}
              onChange={onFormChange}
              required
              disabled={!formState.courseId || subjectSelectDisabled}
            >
              <option value="">
                {!formState.courseId
                  ? 'Select a course first'
                  : isLoadingFormSubjects
                    ? 'Loading subjects…'
                    : sortedFormSubjects.length
                      ? 'Select a subject…'
                      : 'No subjects under this course'}
              </option>
              {sortedFormSubjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title} · #{subject.id}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="admin-field">
        <label htmlFor={idTitle}>Chapter title</label>
        <input
          id={idTitle}
          name="title"
          data-focus-edit="true"
          value={formState.title}
          onChange={onFormChange}
          required
          maxLength={CHAPTER_TITLE_MAX_UX}
          disabled={fieldsDisabled}
          autoComplete="off"
          aria-required="true"
        />
      </div>

      <div className="admin-field">
        <label htmlFor={idOrder}>Order index</label>
        <input
          id={idOrder}
          name="orderIndex"
          type="number"
          min={0}
          step={1}
          value={formState.orderIndex}
          onChange={onFormChange}
          required
          disabled={fieldsDisabled}
          aria-required="true"
        />
      </div>

      <div className="admin-field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor={idDesc}>Description</label>
        <textarea
          id={idDesc}
          name="description"
          rows={4}
          value={formState.description}
          onChange={onFormChange}
          disabled={fieldsDisabled}
          maxLength={CHAPTER_DESCRIPTION_MAX_UX}
        />
      </div>

      {variant === 'create' ? (
        <div className="admin-field">
          <label htmlFor={idActive}>
            <input
              id={idActive}
              name="isActive"
              type="checkbox"
              checked={Boolean(formState.isActive)}
              onChange={onFormChange}
              disabled={fieldsDisabled}
            />{' '}
            Active
          </label>
        </div>
      ) : null}

      {children}
    </>
  );
}
