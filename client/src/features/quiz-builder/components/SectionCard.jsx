import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRoute } from '../../../config/adminPaths';
import { QuizCardEditorProvider } from '../ribbon/QuizCardEditorProvider.jsx';
import QuizCardRibbon from './QuizCardRibbon.jsx';
import QuizRichField from './QuizRichField.jsx';
import {
  isSectionSubjectSelected,
  parseSubjectId,
  resolveSectionSubject,
} from '../utils/sectionSubject.js';

/**
 * @param {{
 *   section: import('../types/quizBuilder.types.js').QuizSection,
 *   index: number,
 *   actions: Record<string, Function>,
 *   disabled?: boolean,
 *   isDragging?: boolean,
 *   onDragStart: (index: number) => void,
 *   onDragEnd: () => void,
 *   onDragOver: (index: number) => void,
 *   onDrop: (index: number) => void,
 *   testId?: string|number|null,
 *   subjects?: Array<{ id: number, title: string }>,
 *   usedSubjectIds?: number[],
 * }} props
 */
export default function SectionCard({
  section,
  index,
  actions,
  disabled = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  testId = null,
  subjects = [],
  usedSubjectIds = [],
}) {
  const [dragOver, setDragOver] = useState(false);
  const labelId = `qb-section-label-${section.id}`;
  const settingsPath = testId ? adminRoute(`tests/${testId}/settings`) : null;
  const resolved = resolveSectionSubject(section, subjects);
  const hasSelection = isSectionSubjectSelected(section, subjects);
  const selectedId = resolved?.id ?? '';

  useEffect(() => {
    if (disabled || !subjects.length) return;
    if (
      resolved &&
      (Number(section.subjectId) !== resolved.id || String(section.subjectLabel || '') !== resolved.title)
    ) {
      actions.updateSection(section.id, { subjectId: resolved.id, subjectLabel: resolved.title });
      return;
    }
    if (!resolved && subjects.length === 1) {
      const only = subjects[0];
      actions.updateSection(section.id, { subjectId: only.id, subjectLabel: only.title });
    }
  }, [actions, disabled, resolved, section.id, section.subjectId, section.subjectLabel, subjects]);

  const handleDelete = useCallback(() => {
    if (disabled) return;
    const confirmed = window.confirm(
      'Delete this section marker? Questions below it will move to the previous section.'
    );
    if (confirmed) {
      actions.deleteSection(section.id);
    }
  }, [actions, disabled, section.id]);

  function handleSubjectChange(event) {
    const subjectId = parseSubjectId(event.target.value);
    const match = subjects.find((subject) => subject.id === subjectId) || null;
    actions.updateSection(section.id, {
      subjectId: match ? match.id : null,
      subjectLabel: match ? match.title : '',
    });
  }

  function handleDragOver(event) {
    event.preventDefault();
    setDragOver(true);
    onDragOver(index);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragOver(false);
    onDrop(index);
  }

  const alreadyUsed = Boolean(selectedId && usedSubjectIds.includes(Number(selectedId)));

  return (
    <article
      className={[
        'qb-section-card',
        section.collapsed ? 'qb-section-card--collapsed' : '',
        isDragging ? 'qb-section-card--dragging' : '',
        dragOver ? 'qb-section-card--drag-over' : '',
        !hasSelection ? 'qb-section-card--incomplete qb-section-card--invalid' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={labelId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="qb-section-card__rail">
        <button
          type="button"
          className="qb-section-card__drag"
          draggable={!disabled}
          onDragStart={() => onDragStart(index)}
          onDragEnd={onDragEnd}
          disabled={disabled}
          aria-label="Drag to reorder section"
          title="Drag to reorder"
        >
          ⠿
        </button>
        <button
          type="button"
          className="qb-section-card__icon-btn"
          onClick={() => actions.toggleSectionCollapsed(section.id)}
          aria-expanded={!section.collapsed}
          aria-label={section.collapsed ? 'Expand section' : 'Collapse section'}
          title={section.collapsed ? 'Expand' : 'Collapse'}
        >
          {section.collapsed ? '▸' : '▾'}
        </button>
        <button
          type="button"
          className="qb-section-card__icon-btn"
          onClick={() => actions.duplicateSection(section.id)}
          disabled={disabled}
          aria-label="Duplicate section"
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          type="button"
          className="qb-section-card__icon-btn qb-section-card__icon-btn--danger"
          onClick={handleDelete}
          disabled={disabled}
          aria-label="Delete section"
          title="Delete"
        >
          ×
        </button>
      </div>

      <div className="qb-section-card__main">
        <header className="qb-section-card__header">
          <span className="qb-section-card__badge" aria-hidden="true">
            Section
          </span>
          <label className="visually-hidden" htmlFor={labelId}>
            Section subject
          </label>
          {subjects.length ? (
            <select
              id={labelId}
              className="qb-section-card__label-input qb-section-card__label-select"
              value={selectedId}
              onChange={handleSubjectChange}
              disabled={disabled}
              aria-invalid={!hasSelection}
              aria-describedby={!hasSelection ? `${labelId}-error` : undefined}
            >
              <option value="">Select a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.title}
                  {usedSubjectIds.includes(subject.id) && subject.id !== selectedId
                    ? ' (also used in another section)'
                    : ''}
                </option>
              ))}
            </select>
          ) : (
            <p className="qb-section-card__label-error" role="status">
              No subjects on this test yet.
              {settingsPath ? (
                <>
                  {' '}
                  <Link to={settingsPath}>Add subjects in Settings</Link>
                </>
              ) : null}
            </p>
          )}
          {subjects.length && !hasSelection ? (
            <p id={`${labelId}-error`} className="qb-section-card__label-error" role="status">
              Select a subject for this section before you can publish.
            </p>
          ) : null}
          {alreadyUsed ? (
            <p className="qb-section-card__label-hint">
              This subject is also used in another section.
            </p>
          ) : null}
        </header>

        {!section.collapsed ? (
          <QuizCardEditorProvider disabled={disabled}>
            <div className="qb-section-card__body" id={`qb-section-body-${section.id}`}>
              <label
                className={[
                  'premium-checkbox',
                  section.showDividerContent ? 'premium-checkbox--checked' : '',
                  disabled ? 'premium-checkbox--disabled' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <input
                  type="checkbox"
                  className="premium-checkbox__input"
                  checked={Boolean(section.showDividerContent)}
                  onChange={(e) =>
                    actions.updateSection(section.id, { showDividerContent: e.target.checked })
                  }
                  disabled={disabled}
                />
                <span className="premium-checkbox__indicator" aria-hidden="true">
                  <svg className="premium-checkbox__check" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2.5 6.2L5 8.7L9.5 3.3"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="premium-checkbox__body">
                  <span className="premium-checkbox__label">Add divider content</span>
                  <span className="premium-checkbox__hint">
                    Optional rich text and images shown to students when they reach this section.
                    Use Insert → Image in the toolbar.
                  </span>
                </span>
              </label>
              {section.showDividerContent ? (
                <div className="qb-section-card__editor">
                  <div className="qb-section-card__ribbon">
                    <QuizCardRibbon />
                  </div>
                  <QuizRichField
                    editorId={`section-divider-${section.id}`}
                    value={section.dividerContentHtml ?? ''}
                    onChange={(dividerContentHtml) =>
                      actions.updateSection(section.id, { dividerContentHtml })
                    }
                    placeholder="Introduction, instructions, or images for this section…"
                    ariaLabel={`Divider content for ${resolved?.title || section.subjectLabel || 'section'}`}
                    disabled={disabled}
                  />
                </div>
              ) : null}
            </div>
          </QuizCardEditorProvider>
        ) : null}
      </div>
    </article>
  );
}
