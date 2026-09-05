export default function StudentDashboardSkeleton() {
  return (
    <section className="sp-dashboard sp-dashboard--skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="sp-skeleton sp-skeleton--hero-card" />
      <div className="sp-skeleton-row">
        <div className="sp-skeleton sp-skeleton--stat" />
        <div className="sp-skeleton sp-skeleton--stat" />
        <div className="sp-skeleton sp-skeleton--stat" />
        <div className="sp-skeleton sp-skeleton--stat" />
      </div>
      <div className="sp-skeleton-course-card" aria-hidden="true">
        <div className="sp-skeleton sp-skeleton-course-card__media" />
        <div className="sp-skeleton-course-card__body">
          <div className="sp-skeleton sp-skeleton-course-card__line sp-skeleton-course-card__line--title" />
          <div className="sp-skeleton sp-skeleton-course-card__line" />
          <div className="sp-skeleton sp-skeleton-course-card__line sp-skeleton-course-card__line--short" />
          <div className="sp-skeleton sp-skeleton-course-card__line sp-skeleton-course-card__line--btn" />
        </div>
      </div>
      <div className="sp-skeleton-grid sp-skeleton-grid--3">
        <div className="sp-skeleton sp-skeleton--panel" />
        <div className="sp-skeleton sp-skeleton--panel" />
        <div className="sp-skeleton sp-skeleton--panel" />
      </div>
      <div className="sp-skeleton-grid">
        <div className="sp-skeleton sp-skeleton--panel" />
        <div className="sp-skeleton sp-skeleton--panel" />
      </div>
    </section>
  );
}
