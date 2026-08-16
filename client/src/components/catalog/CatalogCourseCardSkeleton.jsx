import '../../components/catalog/CategoryFilterBar.css';

export default function CatalogCourseCardSkeleton() {
  return (
    <article className="catalog-course-skeleton" aria-hidden="true">
      <div className="catalog-course-skeleton__cover" />
      <div className="catalog-course-skeleton__body">
        <div className="catalog-course-skeleton__line catalog-course-skeleton__line--title" />
        <div className="catalog-course-skeleton__line catalog-course-skeleton__line--short" />
        <div className="catalog-course-skeleton__line catalog-course-skeleton__line--medium" />
        <div className="catalog-course-skeleton__line catalog-course-skeleton__line--cta" />
      </div>
    </article>
  );
}

export function CatalogCourseGridSkeleton({ count = 6 }) {
  return (
    <div className="catalog-grid-skeleton" aria-busy="true" aria-label="Loading courses">
      {Array.from({ length: count }).map((_, index) => (
        <CatalogCourseCardSkeleton key={`course-skel-${index}`} />
      ))}
    </div>
  );
}
