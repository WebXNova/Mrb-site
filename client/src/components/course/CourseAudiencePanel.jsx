import {
  admissionBadgeLabel,
} from '../../course/courseAdmissionPresentation';
import {
  buildCategoryDetailRows,
} from '../../course/courseCategoryMetadata';
import { formatSalesDateLong } from '../../course/courseSalesPage';

function formatDifficultyLevel(level) {
  const raw = String(level || 'beginner').trim().toLowerCase();
  if (!raw) return 'Beginner';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function DetailFact({ label, value }) {
  if (!value) return null;
  return (
    <div className="sales-audience__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function CategoryDetailsCard({ category }) {
  const rows = buildCategoryDetailRows(category);
  if (!rows.length) return null;

  return (
    <div className="sales-audience__category">
      <dl className="sales-audience__facts">
        {rows.map((row) => (
          <DetailFact key={`${category.id}-${row.label}`} label={row.label} value={row.value} />
        ))}
      </dl>
    </div>
  );
}

/**
 * Public course detail — class, department, board, and program facts.
 * @param {{
 *   categories?: Array<Record<string, unknown>>,
 *   course?: Record<string, unknown>|null,
 *   admissionsOpen?: boolean,
 * }} props
 */
export default function CourseAudiencePanel({ categories = [], course = null, admissionsOpen = false }) {
  const hasCategories = categories.length > 0;
  const admissionsLabel = course ? admissionBadgeLabel(course.admission_status) : '';
  const admissionsValue = admissionsLabel
    ? `${admissionsLabel}${course?.enrollment_message ? ` — ${course.enrollment_message}` : ''}`
    : '';
  const generalRows = [
    course?.level ? { label: 'Difficulty', value: formatDifficultyLevel(course.level) } : null,
    admissionsValue ? { label: 'Admissions', value: admissionsValue } : null,
    course?.start_date ? { label: 'Course starts', value: formatSalesDateLong(course.start_date) } : null,
    course?.end_date ? { label: 'Course ends', value: formatSalesDateLong(course.end_date) } : null,
  ].filter(Boolean);

  if (!hasCategories && !generalRows.length) return null;

  return (
    <section className="sales-audience" aria-labelledby="sales-audience-title">
      <div className="container">
        <div className="sales-audience__header">
          <h2 id="sales-audience-title" className="sales-section__title">
            Course details
          </h2>
          <p className="sales-section__subtitle">
            {hasCategories
              ? 'Check the class, department, and board to confirm this course matches your study level.'
              : 'Key program information before you enroll.'}
          </p>
        </div>

        <div className={`sales-audience__grid${hasCategories ? '' : ' sales-audience__grid--general-only'}`}>
          {hasCategories ? (
            <div className="sales-audience__categories">
              {categories.map((category) => (
                <CategoryDetailsCard key={category.id} category={category} />
              ))}
            </div>
          ) : null}

          {generalRows.length ? (
            <dl className="sales-audience__facts sales-audience__facts--general">
              {generalRows.map((row) => (
                <DetailFact key={row.label} label={row.label} value={row.value} />
              ))}
            </dl>
          ) : null}
        </div>

        {!admissionsOpen && course?.enrollment_message ? (
          <p className="sales-audience__notice" role="status">
            {course.enrollment_message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
