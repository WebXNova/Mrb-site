function onSelectValue(handler) {
  return (event) => {
    handler(event.target.value);
  };
}

/**
 * Accessible Course → Subject → (optional Chapter) selects driven by {@link useAdminHierarchyCascade}.
 *
 * @param {object} props
 * @param {ReturnType<import('./useAdminHierarchyCascade.js').useAdminHierarchyCascade>} props.cascade
 * @param {2 | 3} [props.depth=3]
 * @param {boolean} [props.disabled=false]
 * @param {{ course?: string, subject?: string, chapter?: string }} [props.idPrefix={}]
 */
export default function AdminHierarchySelectors({ cascade, depth = 3, disabled = false, idPrefix = {} }) {
  const idCourse = idPrefix.course ?? 'hierarchy-course';
  const idSubject = idPrefix.subject ?? 'hierarchy-subject';
  const idChapter = idPrefix.chapter ?? 'hierarchy-chapter';

  const {
    sortedCourses,
    sortedSubjects,
    sortedChapters,
    selectedCourseId,
    selectedSubjectId,
    selectedChapterId,
    selectCourse,
    selectSubject,
    selectChapter,
    isLoadingCourses,
    isLoadingSubjects,
    isLoadingChapters,
  } = cascade;

  const mutationOrLoadingDisabled = disabled;

  const courseDisabled = mutationOrLoadingDisabled || isLoadingCourses;
  const subjectDisabled =
    mutationOrLoadingDisabled || !selectedCourseId || isLoadingSubjects || isLoadingCourses;
  const chapterDisabled =
    depth < 3 ||
    mutationOrLoadingDisabled ||
    !selectedSubjectId ||
    isLoadingChapters ||
    isLoadingSubjects ||
    !selectedCourseId;

  return (
    <>
      <div className="admin-field">
        <label htmlFor={idCourse}>Course</label>
        <select
          id={idCourse}
          value={selectedCourseId}
          onChange={onSelectValue(selectCourse)}
          disabled={courseDisabled}
          aria-busy={isLoadingCourses}
          aria-required="true"
        >
          <option value="">
            {isLoadingCourses ? 'Loading courses…' : sortedCourses.length ? 'Select a course…' : 'No courses available'}
          </option>
          {sortedCourses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · #{c.id}
            </option>
          ))}
        </select>
        {!selectedCourseId ? <p className="admin-muted" style={{ marginTop: '0.35rem' }}>Select a course first.</p> : null}
      </div>

      <div className="admin-field">
        <label htmlFor={idSubject}>Subject</label>
        <select
          id={idSubject}
          value={selectedSubjectId}
          onChange={onSelectValue(selectSubject)}
          disabled={subjectDisabled}
          aria-busy={isLoadingSubjects}
          aria-disabled={!selectedCourseId}
        >
          <option value="">
            {!selectedCourseId
              ? 'Select a course first'
              : isLoadingSubjects
                ? 'Loading subjects…'
                : sortedSubjects.length
                  ? depth === 3
                    ? 'All subjects…'
                    : 'Select a subject…'
                  : 'No subjects available.'}
          </option>
          {sortedSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · #{s.id}
            </option>
          ))}
        </select>
      </div>

      {depth >= 3 ? (
        <div className="admin-field">
          <label htmlFor={idChapter}>Chapter</label>
          <select
            id={idChapter}
            value={selectedChapterId}
            onChange={onSelectValue(selectChapter)}
            disabled={chapterDisabled}
            aria-busy={isLoadingChapters}
            aria-disabled={!selectedSubjectId}
          >
            <option value="">
              {!selectedSubjectId
                ? 'Select a subject first'
                : isLoadingChapters
                  ? 'Loading chapters…'
                  : sortedChapters.length
                    ? 'All chapters…'
                    : 'No chapters found.'}
            </option>
            {sortedChapters.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.title} · #{ch.id}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}
