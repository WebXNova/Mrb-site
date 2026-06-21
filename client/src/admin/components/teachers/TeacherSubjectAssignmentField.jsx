import { useMemo, useState } from 'react';
import AdminSearchField from '../AdminSearchField';
import { SUBJECT_SEARCH_THRESHOLD } from '../../hooks/useUniqueTeacherSubjects';

export default function TeacherSubjectAssignmentField({
  subjects = [],
  selectedIds = [],
  onToggle,
  error,
  isLoading = false,
  loadError = '',
  disabled = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const showSearch = subjects.length >= SUBJECT_SEARCH_THRESHOLD;

  const filteredSubjects = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return subjects;
    return subjects.filter((subject) => String(subject.title || '').toLowerCase().includes(query));
  }, [subjects, searchQuery]);

  return (
    <fieldset className="admin-teacher-subjects-field">
      <legend className="admin-teacher-subjects-field__legend">Assigned Subjects</legend>
      <p className="admin-teacher-subjects-field__intro">
        Select the subjects this teacher is allowed to handle. Teachers will only receive student questions from
        the subjects assigned here.
      </p>
      <p className="admin-teacher-subjects-field__helper">
        Teachers will only receive and answer student questions from their assigned subjects.
      </p>

      {error ? (
        <p className="premium-field__error" role="alert">
          {error}
        </p>
      ) : null}

      {loadError ? (
        <div className="admin-empty-state admin-empty-state--compact">
          <p className="admin-empty-state__title">Could not load subjects</p>
          <p className="admin-empty-state__text">{loadError}</p>
        </div>
      ) : isLoading ? (
        <div aria-busy="true" aria-label="Loading subjects">
          <div className="admin-skeleton admin-skeleton-row" />
          <div className="admin-skeleton admin-skeleton-row" />
          <div className="admin-skeleton admin-skeleton-row" />
        </div>
      ) : subjects.length === 0 ? (
        <div className="admin-empty-state admin-empty-state--compact">
          <p className="admin-empty-state__title">No subjects available</p>
          <p className="admin-empty-state__text">
            Add active subjects in the LMS before assigning teachers.
          </p>
        </div>
      ) : (
        <>
          {showSearch ? (
            <div className="admin-teacher-subjects-field__search">
              <AdminSearchField
                id="teacher-subjects-search"
                label="Search subjects"
                placeholder="Search subjects…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onClear={() => setSearchQuery('')}
              />
            </div>
          ) : null}

          {filteredSubjects.length === 0 ? (
            <div className="admin-empty-state admin-empty-state--compact">
              <p className="admin-empty-state__title">No subjects match your search</p>
              <p className="admin-empty-state__text">Try a different keyword or clear the search.</p>
              {searchQuery ? (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm admin-touch-target"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className="admin-teacher-subjects-field__grid"
              role="group"
              aria-label="Subject assignment options"
            >
              {filteredSubjects.map((subject) => {
                const subjectId = Number(subject.id);
                const checked = selectedIds.includes(subjectId);
                const inputId = `teacher-subject-${subjectId}`;
                return (
                  <label
                    key={subjectId}
                    className={`admin-teacher-subjects-field__item${checked ? ' admin-teacher-subjects-field__item--checked' : ''}`}
                    htmlFor={inputId}
                  >
                    <input
                      id={inputId}
                      type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => onToggle(subjectId)}
                    />
                    <span className="admin-teacher-subjects-field__label">{subject.title}</span>
                  </label>
                );
              })}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
