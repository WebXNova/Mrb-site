import {
  formatCategoryChipLabel,
  formatCategoryEnrichedLabel,
} from '../../course/courseCategoryMetadata';

/**
 * Public course detail / catalog category chips.
 * @param {{ categories?: Array<Record<string, unknown>>, className?: string }} props
 */
export default function CourseCategoryChips({ categories = [], className = '' }) {
  if (!categories.length) return null;

  return (
    <div className={`sales-category-chips${className ? ` ${className}` : ''}`} role="list">
      {categories.map((category) => (
        <span
          key={category.id}
          className="sales-category-chip"
          role="listitem"
          title={formatCategoryEnrichedLabel(category)}
        >
          {formatCategoryChipLabel(category)}
        </span>
      ))}
    </div>
  );
}
