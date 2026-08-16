import { useMemo, useState } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SearchIcon from '@mui/icons-material/Search';
import {
  formatCategoryContextSubtext,
  formatCategoryEnrichedLabel,
} from '../../../course/courseCategoryMetadata';

const SEARCH_THRESHOLD = 6;

/**
 * Chip-based multi-select for course categories on the General tab.
 */
export default function CourseCategoryAssignmentField({
  allCategories = [],
  selectedIds = [],
  onToggle,
  isLoading = false,
  loadError = '',
  disabled = false,
}) {
  const [query, setQuery] = useState('');

  const categoryById = useMemo(() => {
    const map = new Map();
    for (const cat of allCategories) map.set(Number(cat.id), cat);
    return map;
  }, [allCategories]);

  const inactiveAssignedIds = useMemo(() => {
    const selectedSet = new Set(selectedIds.map((id) => Number(id)));
    return allCategories
      .filter((cat) => selectedSet.has(Number(cat.id)) && !cat.isActive)
      .map((cat) => Number(cat.id));
  }, [allCategories, selectedIds]);

  const selectableCategories = useMemo(
    () => allCategories.filter((cat) => cat.isActive),
    [allCategories]
  );

  const selectedActive = useMemo(
    () =>
      selectedIds
        .map((id) => categoryById.get(Number(id)))
        .filter((cat) => cat && cat.isActive),
    [selectedIds, categoryById]
  );

  const lockedInactive = useMemo(
    () => allCategories.filter((cat) => inactiveAssignedIds.includes(Number(cat.id))),
    [allCategories, inactiveAssignedIds]
  );

  const availableOptions = useMemo(() => {
    const selectedSet = new Set(selectedIds.map((id) => Number(id)));
    const q = query.trim().toLowerCase();
    return selectableCategories.filter((cat) => {
      if (selectedSet.has(Number(cat.id))) return false;
      if (!q) return true;
      const haystack = `${cat.name || ''} ${formatCategoryContextSubtext(cat)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [selectableCategories, selectedIds, query]);

  const showSearch = selectableCategories.length >= SEARCH_THRESHOLD;

  return (
    <div className="course-category-select">
      {loadError ? (
        <p className="admin-error course-category-select__error" role="alert">
          {loadError}
        </p>
      ) : null}

      {isLoading ? (
        <div className="course-category-select__skeleton" aria-busy="true" aria-label="Loading categories">
          <div className="course-category-select__skeleton-line course-category-select__skeleton-line--short" />
          <div className="course-category-select__skeleton-line" />
          <div className="course-category-select__skeleton-line course-category-select__skeleton-line--medium" />
        </div>
      ) : allCategories.length === 0 ? (
        <p className="course-category-select__hint">No categories configured yet. Add categories under Settings.</p>
      ) : (
        <>
          {(selectedActive.length > 0 || lockedInactive.length > 0) && (
            <div className="course-category-select__selected" aria-label="Selected categories">
              {selectedActive.map((cat) => {
                const context = formatCategoryContextSubtext(cat);
                return (
                <span
                  key={cat.id}
                  className="course-category-select__pill course-category-select__pill--selected"
                  title={formatCategoryEnrichedLabel(cat)}
                >
                  <span className="course-category-select__pill-label">{cat.name}</span>
                  {context ? (
                    <span className="course-category-select__pill-context">{context}</span>
                  ) : null}
                  <button
                    type="button"
                    className="course-category-select__pill-remove"
                    disabled={disabled}
                    onClick={() => onToggle(Number(cat.id))}
                    aria-label={`Remove ${cat.name}`}
                  >
                    <CloseIcon sx={{ fontSize: 14 }} />
                  </button>
                </span>
              );
              })}
              {lockedInactive.map((cat) => (
                <span
                  key={cat.id}
                  className="course-category-select__pill course-category-select__pill--locked"
                  title={formatCategoryEnrichedLabel(cat)}
                >
                  <LockOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
                  <span className="course-category-select__pill-label">{cat.name}</span>
                  {formatCategoryContextSubtext(cat) ? (
                    <span className="course-category-select__pill-context">
                      {formatCategoryContextSubtext(cat)}
                    </span>
                  ) : null}
                  <span className="course-category-select__pill-note">Inactive</span>
                </span>
              ))}
            </div>
          )}

          {selectableCategories.length === 0 ? (
            <p className="course-category-select__hint">No active categories available for new assignments.</p>
          ) : (
            <>
              {showSearch ? (
                <label className="course-category-select__search">
                  <SearchIcon sx={{ fontSize: 18 }} aria-hidden />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search categories to add…"
                    disabled={disabled}
                    aria-label="Search categories"
                  />
                </label>
              ) : null}

              <ul className="course-category-select__options" role="listbox" aria-label="Available categories">
                {availableOptions.length === 0 ? (
                  <li className="course-category-select__option course-category-select__option--empty">
                    {query.trim() ? 'No categories match your search.' : 'All active categories are selected.'}
                  </li>
                ) : (
                  availableOptions.map((cat) => {
                    const context = formatCategoryContextSubtext(cat);
                    return (
                    <li key={cat.id}>
                      <button
                        type="button"
                        className="course-category-select__option"
                        disabled={disabled}
                        onClick={() => onToggle(Number(cat.id))}
                        title={formatCategoryEnrichedLabel(cat)}
                      >
                        <span className="course-category-select__option-text">
                          <span>{cat.name}</span>
                          {context ? (
                            <span className="course-category-select__option-context">{context}</span>
                          ) : null}
                        </span>
                        <span className="course-category-select__option-action">Add</span>
                      </button>
                    </li>
                  );
                  })
                )}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
