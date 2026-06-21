import CourseCard from '../../../components/ui/CourseCard';
import { mapCatalogCourseToCardProps } from '../../../course/coursePresentation';
import CourseStatusBadge from './CourseStatusBadge';
import CourseLevelBadge from './CourseLevelBadge';

function formatPricingPreview(pricing) {
  if (!pricing) return 'Not set';
  const type = String(pricing.pricing_type || pricing.type || '').toLowerCase();
  if (type === 'free') return 'Free';
  const amount = Number(pricing.price_amount ?? 0).toLocaleString('en-PK');
  const currency = pricing.currency_code || pricing.currency || 'PKR';
  return `${currency} ${amount}`;
}

export default function CourseLivePreviewPanel({ course, pricing, stepIndex = 0 }) {
  const cardCourse = mapCatalogCourseToCardProps({
    id: 1,
    title: course.title || 'Course title',
    description: course.description || '',
    short_description: course.short_description,
    level: course.level || 'beginner',
    thumbnail_url: course.thumbnail_url,
    start_date: course.start_date ?? null,
    end_date: course.end_date ?? null,
    admission_status: course.admission_status || 'CLOSED',
    is_enrollment_open: String(course.admission_status || 'CLOSED').toUpperCase() === 'OPEN',
    pricing:
      pricing && pricing.pricing_type
        ? {
            type: pricing.pricing_type,
            price_amount: pricing.price_amount,
            original_price_amount: pricing.original_price_amount,
            currency: pricing.currency_code || 'PKR',
          }
        : null,
  });

  return (
    <aside className="course-live-preview" aria-label="Live course preview">
      <div className="course-live-preview__card">
        <div className="course-live-preview__header">
          <h3 className="course-live-preview__title">Live preview</h3>
          <span className="course-live-preview__badge-live">Updating</span>
        </div>
        <div className="course-live-preview__body">
          <div className="course-live-preview__mock-card">
            {cardCourse ? <CourseCard course={cardCourse} /> : null}
          </div>
          <div className="course-live-preview__stats">
            <div className="course-live-preview__stat">
              <div className="course-live-preview__stat-label">Level</div>
              <div className="course-live-preview__stat-value">
                <CourseLevelBadge level={course.level || 'beginner'} />
              </div>
            </div>
            <div className="course-live-preview__stat">
              <div className="course-live-preview__stat-label">Status</div>
              <div className="course-live-preview__stat-value">
                <CourseStatusBadge active={!!course.is_active} />
              </div>
            </div>
            <div className="course-live-preview__stat">
              <div className="course-live-preview__stat-label">Pricing</div>
              <div className="course-live-preview__stat-value">{formatPricingPreview(pricing)}</div>
            </div>
            <div className="course-live-preview__stat">
              <div className="course-live-preview__stat-label">Students</div>
              <div className="course-live-preview__stat-value">—</div>
            </div>
          </div>
        </div>
      </div>

      <div className="course-publish-panel">
        <h4 className="course-publish-panel__title">Publishing settings</h4>
        <ul className="course-publish-panel__list">
          <li className="course-publish-panel__item">
            <span>Catalog visibility</span>
            <CourseStatusBadge active={!!course.is_active} />
          </li>
          <li className="course-publish-panel__item">
            <span>Wizard step</span>
            <strong>{stepIndex + 1} / 5</strong>
          </li>
          <li className="course-publish-panel__item">
            <span>Thumbnail</span>
            <strong>{course.thumbnail_url ? 'Ready' : 'Required'}</strong>
          </li>
          <li className="course-publish-panel__item">
            <span>Description</span>
            <strong>{(course.description || '').length >= 30 ? 'Ready' : 'Min 30 chars'}</strong>
          </li>
        </ul>
      </div>
    </aside>
  );
}
