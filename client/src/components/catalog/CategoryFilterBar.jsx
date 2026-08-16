import './CategoryFilterBar.css';
import { formatCategoryEnrichedLabel } from '../../course/courseCategoryMetadata';

/**
 * Reusable public catalog category filter — display only.
 */
export default function CategoryFilterBar({
  categories = [],
  selectedCategoryId = null,
  onSelect,
  loading = false,
  disabled = false,
}) {
  const isDisabled = disabled || loading;

  return (
    <div className="category-filter-bar" role="group" aria-label="Filter courses by category">
      <span className="category-filter-bar__label">Browse by category</span>
      <div className="category-filter-bar__scroll">
        <button
          type="button"
          className={`category-filter-bar__pill${
            selectedCategoryId == null ? ' category-filter-bar__pill--active' : ''
          }`}
          aria-pressed={selectedCategoryId == null}
          disabled={isDisabled}
          onClick={() => onSelect(null)}
        >
          All courses
        </button>

        {loading && categories.length === 0
          ? Array.from({ length: 4 }).map((_, index) => (
              <span
                key={`cat-skel-${index}`}
                className="category-filter-bar__pill category-filter-bar__pill--skeleton"
                aria-hidden
              />
            ))
          : null}

        {!loading || categories.length > 0
          ? categories.map((category) => {
              const id = Number(category.id);
              const active = selectedCategoryId === id;
              const label = formatCategoryEnrichedLabel(category);
              return (
                <button
                  key={id}
                  type="button"
                  className={`category-filter-bar__pill${active ? ' category-filter-bar__pill--active' : ''}`}
                  aria-pressed={active}
                  disabled={isDisabled}
                  onClick={() => onSelect(id)}
                  title={label}
                >
                  {label}
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}
