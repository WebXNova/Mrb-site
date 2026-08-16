import { formatCategoryEnrichedLabel } from '../../../course/courseCategoryMetadata';

const MAX_VISIBLE = 2;

/**
 * Compact category chips for admin course table rows.
 * @param {{ categories?: Array<{ id: number, name: string, isActive?: boolean }> }} props
 */
export default function CourseCategoryTags({ categories = [] }) {
  if (!categories.length) {
    return <span className="courses-table__category-empty">—</span>;
  }

  const visible = categories.slice(0, MAX_VISIBLE);
  const overflow = categories.length - MAX_VISIBLE;

  return (
    <div className="courses-table__categories">
      {visible.map((cat) => (
        <span
          key={cat.id}
          className={`courses-table__category-tag${
            cat.isActive === false ? ' courses-table__category-tag--inactive' : ''
          }`}
          title={formatCategoryEnrichedLabel(cat)}
        >
          {cat.name}
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="courses-table__category-tag courses-table__category-tag--more"
          title={categories
            .slice(MAX_VISIBLE)
            .map((c) => formatCategoryEnrichedLabel(c))
            .join(', ')}
        >
          +{overflow} more
        </span>
      ) : null}
    </div>
  );
}
