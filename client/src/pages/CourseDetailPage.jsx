import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import CourseEnrollmentCtaButton from '../components/course/CourseEnrollmentCtaButton';
import EnrollmentCountdown from '../components/course/EnrollmentCountdown';
import { catalogApi } from '../api/catalogApi';
import { buildPricingDisplay, mapCatalogCourseToDetailProps } from '../course/coursePresentation';
import { usePageSeo } from '../seo/SeoContext.jsx';
import { SITE_ORIGIN } from '../seo/seoConfig.js';
import { buildCourseSchema } from '../seo/structuredData.js';
import {
  batchStatusBadgeClass,
  batchStatusLabel,
} from '../course/batchPresentation';
import {
  admissionBadgeLabel,
  admissionBadgeTone,
  isAdmissionOpen,
} from '../course/courseAdmissionPresentation';
import {
  buildCohortHighlights,
  buildEnrollmentPitch,
  buildStartHeadline,
  buildTrustBadges,
  computeDiscountPercent,
  formatSalesAmount,
  formatSalesDate,
  formatSalesDateLong,
  formatTimezoneLabel,
  pickFeaturedBatch,
  resolveActiveCountdown,
  shouldShowSeatUrgency,
} from '../course/courseSalesPage';
import './CourseDetailPage.css';

function levelBadgeTone(level) {
  const l = String(level || 'beginner').toLowerCase();
  if (l === 'advanced') return 'warning';
  return 'neutral';
}

function instructorInitial(name) {
  const t = String(name || '').trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function PricingCard({ pricingDisplay, courseId, batch, enrollPitch, courseAdmission }) {
  if (!pricingDisplay) return null;
  const discountPct =
    !pricingDisplay.isFree && pricingDisplay.original
      ? computeDiscountPercent(pricingDisplay.original, pricingDisplay.amount)
      : null;

  return (
    <div className="sales-pricing">
      {discountPct != null ? (
        <span className="sales-pricing__discount-pill">Save {discountPct}% today</span>
      ) : null}
      {pricingDisplay.isFree ? (
        <div className="sales-pricing__row">
          <span className="sales-pricing__current">Free</span>
          <span className="sales-pricing__note">No payment required</span>
        </div>
      ) : (
        <div className="sales-pricing__row">
          <span className="sales-pricing__current">{formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency)}</span>
          {pricingDisplay.original ? (
            <span className="sales-pricing__original">
              {formatSalesAmount(pricingDisplay.original, pricingDisplay.currency)}
            </span>
          ) : null}
        </div>
      )}
      {batch?.start_date ? (
        <p className="sales-pricing__cohort-line">
          <strong>Starts:</strong> {formatSalesDateLong(batch.start_date)}
        </p>
      ) : null}
      {batch && Number(batch.total_seats) > 0 ? (
        <p className="sales-pricing__cohort-line sales-pricing__cohort-line--seats">
          <strong>{batch.seats_remaining}</strong> of {batch.total_seats} seats remaining
        </p>
      ) : null}
      {enrollPitch ? <p className="sales-pricing__pitch">{enrollPitch}</p> : null}
      <div className="sales-pricing__actions">
        <CourseEnrollmentCtaButton
          courseId={courseId}
          labelContext="pricing"
          size="lg"
          fullWidth
          courseAdmission={courseAdmission}
        />
        <Button as={Link} to="/courses" variant="secondary" size="md" fullWidth>
          Browse other courses
        </Button>
      </div>
    </div>
  );
}

function CohortHighlightGrid({ items }) {
  if (!items.length) return null;
  return (
    <div className="sales-highlights" role="list">
      {items.map((item) => (
        <div
          key={item.id}
          className={`sales-highlights__item${item.accent ? ' sales-highlights__item--accent' : ''}`}
          role="listitem"
        >
          <span className="sales-highlights__label">{item.label}</span>
          <span className="sales-highlights__value">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function CohortTimeline({ batch, course }) {
  if (!batch?.start_date && !course?.start_date) return null;
  const steps = [
    course?.start_date
      ? { key: 'course-start', label: 'Course starts', date: course.start_date }
      : null,
    course?.end_date
      ? { key: 'course-end', label: 'Course ends', date: course.end_date }
      : null,
    batch?.start_date
      ? { key: 'start', label: 'Classes begin', date: batch.start_date, highlight: true }
      : null,
    batch?.end_date ? { key: 'end', label: 'Program completes', date: batch.end_date } : null,
  ].filter(Boolean);

  return (
    <div className="sales-timeline" aria-label="Cohort timeline">
      {steps.map((step, index) => (
        <div
          key={step.key}
          className={`sales-timeline__step${step.highlight ? ' sales-timeline__step--highlight' : ''}`}
        >
          <div className="sales-timeline__marker" aria-hidden="true">
            {index + 1}
          </div>
          <div className="sales-timeline__content">
            <span className="sales-timeline__label">{step.label}</span>
            <strong className="sales-timeline__date">{formatSalesDateLong(step.date)}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CourseDetailPage() {
  const { id: routeId } = useParams();
  const [course, setCourse] = useState(null);
  const [batches, setBatches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const courseId = Number(String(routeId || '').trim());
    if (!Number.isFinite(courseId) || courseId <= 0) {
      setLoading(false);
      setCourse(null);
      setError('Invalid course id');
      return undefined;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await catalogApi.getCourse(courseId);
        const raw = res?.data;
        const [batchRes, subjectRes] = await Promise.all([
          catalogApi.listCourseBatches(courseId).catch(() => ({ data: [] })),
          catalogApi.listCourseSubjects(courseId).catch(() => ({ data: [] })),
        ]);
        if (!cancelled) {
          setCourse(raw ? mapCatalogCourseToDetailProps(raw) : null);
          setBatches(Array.isArray(batchRes?.data) ? batchRes.data : []);
          setSubjects(Array.isArray(subjectRes?.data) ? subjectRes.data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || 'Failed to load course');
          setCourse(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const featuredBatch = useMemo(() => pickFeaturedBatch(batches), [batches]);
  const pricingDisplay = useMemo(() => (course ? buildPricingDisplay(course.pricing) : null), [course]);
  const trustBadges = useMemo(
    () =>
      buildTrustBadges({
        batch: featuredBatch,
        subjectsCount: subjects.length,
        pricingDisplay,
      }),
    [featuredBatch, subjects.length, pricingDisplay]
  );

  const cohortHighlights = useMemo(() => buildCohortHighlights(featuredBatch), [featuredBatch]);
  const startHeadline = useMemo(() => buildStartHeadline(featuredBatch), [featuredBatch]);
  const enrollPitch = useMemo(
    () => buildEnrollmentPitch(featuredBatch, pricingDisplay),
    [featuredBatch, pricingDisplay]
  );
  const discountPct = useMemo(
    () =>
      pricingDisplay && !pricingDisplay.isFree && pricingDisplay.original
        ? computeDiscountPercent(pricingDisplay.original, pricingDisplay.amount)
        : null,
    [pricingDisplay]
  );

  const activeCountdown = useMemo(() => resolveActiveCountdown(featuredBatch), [featuredBatch]);
  const seatsRemaining = featuredBatch != null ? Number(featuredBatch.seats_remaining ?? 0) : null;
  const showSeatsUrgency = shouldShowSeatUrgency(featuredBatch);
  const admissionsOpen = course ? isAdmissionOpen(course) : false;
  const courseAdmission = course
    ? {
        admission_status: course.admission_status,
        is_enrollment_open: course.is_enrollment_open,
        enrollment_message: course.enrollment_message,
        start_date: course.start_date,
        end_date: course.end_date,
      }
    : null;

  const pageSeo = useMemo(() => {
    if (!course) return null;
    return {
      title: `${course.title} | MRB Classes`,
      description: course.summary || undefined,
      image: course.thumbnail_url || undefined,
      structuredData: buildCourseSchema({
        name: course.title,
        description: course.summary,
        startDate: course.start_date,
        endDate: course.end_date,
        image: course.thumbnail_url,
        url: `${SITE_ORIGIN}/courses/${encodeURIComponent(String(course.id))}`,
      }),
    };
  }, [course]);

  usePageSeo(pageSeo);

  if (loading) {
    return (
      <PageLayout>
        <section className="sales-page sales-page--loading">
          <div className="container">
            <p className="body-md">Loading course…</p>
          </div>
        </section>
      </PageLayout>
    );
  }

  if (!course || error) {
    return (
      <PageLayout>
        <section className="section">
          <div className="container container-narrow course-not-found">
            <h1 className="heading-1">Course not found</h1>
            <p className="body-md">
              {error || 'The course you’re looking for doesn’t exist or may have been moved.'}
            </p>
            <Button as={Link} to="/courses" variant="primary" size="md">
              Back to all courses
            </Button>
          </div>
        </section>
      </PageLayout>
    );
  }

  const thumbnailUrl = course.thumbnail_url || '';
  const hasThumbnail = Boolean(thumbnailUrl);

  return (
    <PageLayout>
      <article className="sales-page">
        <div
          className={`sales-announcement${admissionsOpen ? '' : ' sales-announcement--closed'}`}
          role="status"
        >
          <div className="container sales-announcement__inner">
            <div className="sales-announcement__copy">
              {admissionsOpen ? (
                <span className="sales-announcement__pulse" aria-hidden="true" />
              ) : null}
              <p>
                {admissionsOpen ? (
                  <>
                    <strong>{course.enrollment_message || 'Enrollment is open'}</strong>
                    {course.end_date
                      ? ` — apply by ${formatSalesDateLong(course.end_date)}`
                      : ''}
                    {featuredBatch?.start_date
                      ? ` · Classes start ${formatSalesDateLong(featuredBatch.start_date)}`
                      : ''}
                  </>
                ) : (
                  <>
                    <strong>{course.enrollment_message || 'Admissions are currently closed.'}</strong>
                    {course.start_date
                      ? ` Check back from ${formatSalesDateLong(course.start_date)}.`
                      : ''}
                  </>
                )}
              </p>
            </div>
            {admissionsOpen && activeCountdown ? (
              <EnrollmentCountdown
                deadlineIso={activeCountdown.deadlineIso}
                label={activeCountdown.label}
                expiredMessage={activeCountdown.expiredMessage}
                variant="announcement"
              />
            ) : null}
          </div>
        </div>

        {/* Hero */}
        <section className="sales-hero">
          <div className="container">
            <nav aria-label="Breadcrumb" className="sales-breadcrumb">
              <Link to="/">Home</Link>
              <span aria-hidden="true">/</span>
              <Link to="/courses">Courses</Link>
              <span aria-hidden="true">/</span>
              <span className="sales-breadcrumb__current">{course.title}</span>
            </nav>

            <div className="sales-hero__grid">
              <div className="sales-hero__copy">
                <div className="sales-hero__badges">
                  <Badge tone={levelBadgeTone(course.level)} size="lg">
                    {course.level}
                  </Badge>
                  <Badge tone={admissionBadgeTone(course.admission_status)} size="lg">
                    {admissionBadgeLabel(course.admission_status)}
                  </Badge>
                  {featuredBatch ? (
                    <span className={batchStatusBadgeClass(featuredBatch.status)}>
                      {batchStatusLabel(featuredBatch.status)}
                    </span>
                  ) : null}
                </div>

                <h1 className="sales-hero__title">{course.title}</h1>
                {startHeadline ? <p className="sales-hero__start-line">{startHeadline}</p> : null}
                <p className="sales-hero__lead">{course.summary}</p>

                {cohortHighlights.length > 0 ? (
                  <CohortHighlightGrid items={cohortHighlights.slice(0, 4)} />
                ) : null}

                {(showSeatsUrgency || discountPct != null) && (
                  <div className="sales-urgency">
                    {discountPct != null ? (
                      <p className="sales-urgency__offer">
                        Limited offer — <strong>{discountPct}% off</strong> the standard price
                      </p>
                    ) : null}
                    {showSeatsUrgency ? (
                      <p className="sales-urgency__seats" role="status">
                        Hurry — only <strong>{seatsRemaining}</strong> seat
                        {seatsRemaining === 1 ? '' : 's'} left in this cohort
                      </p>
                    ) : null}
                  </div>
                )}

                <p className="sales-hero__pitch">{enrollPitch}</p>

                {!admissionsOpen && course.enrollment_message ? (
                  <p className="sales-hero__admission-note" role="status">
                    {course.enrollment_message}
                  </p>
                ) : null}

                <div className="sales-hero__cta sales-hero__cta--desktop">
                  <CourseEnrollmentCtaButton
                    courseId={routeId}
                    labelContext="hero"
                    size="lg"
                    courseAdmission={courseAdmission}
                  />
                </div>
              </div>

              <aside className="sales-hero__aside">
                <div className="sales-hero__visual">
                  {hasThumbnail ? (
                    <img
                      className="sales-hero__image"
                      src={thumbnailUrl}
                      alt=""
                      loading="eager"
                      decoding="async"
                      sizes="(max-width: 1024px) 100vw, 480px"
                    />
                  ) : (
                    <div className="sales-hero__image-fallback" aria-hidden="true">
                      <span>{course.title.slice(0, 1)}</span>
                    </div>
                  )}
                </div>
                <PricingCard
                  pricingDisplay={pricingDisplay}
                  courseId={routeId}
                  batch={featuredBatch}
                  enrollPitch={null}
                  courseAdmission={courseAdmission}
                />
              </aside>
            </div>
          </div>
        </section>

        {featuredBatch ? (
          <section className="sales-spotlight" aria-label="Key dates">
            <div className="container">
              <div className="sales-spotlight__grid">
                <div className="sales-spotlight__intro">
                  <h2 className="sales-spotlight__title">Your cohort at a glance</h2>
                  <p className="sales-spotlight__text">{enrollPitch}</p>
                  {featuredBatch.instructor_name ? (
                    <p className="sales-spotlight__instructor">
                      Taught by <strong>{featuredBatch.instructor_name}</strong>
                      {featuredBatch.schedule_label ? ` · ${featuredBatch.schedule_label}` : ''}
                    </p>
                  ) : null}
                </div>
                <CohortTimeline batch={featuredBatch} course={course} />
              </div>
            </div>
          </section>
        ) : null}

        {/* Trust badges */}
        {trustBadges.length > 0 ? (
          <section className="sales-trust" aria-label="Course benefits">
            <div className="container">
              <ul className="sales-trust__list">
                {trustBadges.map((badge) => (
                  <li key={badge.id} className="sales-trust__item">
                    <span className="sales-trust__icon" aria-hidden="true">
                      ✓
                    </span>
                    <div>
                      <strong>{badge.label}</strong>
                      {badge.detail ? <span>{badge.detail}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {/* About */}
        {course.description ? (
          <section className="sales-section">
            <div className="container container-narrow">
              <h2 className="sales-section__title">About this course</h2>
              <div className="sales-prose">{course.description}</div>
            </div>
          </section>
        ) : null}

        {/* Subjects */}
        {subjects.length > 0 ? (
          <section className="sales-section sales-section--muted">
            <div className="container">
              <h2 className="sales-section__title">What you&apos;ll study</h2>
              <p className="sales-section__subtitle">
                {subjects.length} structured unit{subjects.length === 1 ? '' : 's'} in this program
              </p>
              <ol className="sales-curriculum">
                {subjects.map((subject, index) => (
                  <li key={subject.id} className="sales-curriculum__item">
                    <span className="sales-curriculum__index">{index + 1}</span>
                    <div>
                      <h3 className="sales-curriculum__title">{subject.title}</h3>
                      {subject.description ? (
                        <p className="sales-curriculum__summary">{subject.description}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        ) : null}

        {/* Batch details */}
        {featuredBatch ? (
          <section className="sales-section">
            <div className="container container-narrow">
              <h2 className="sales-section__title">Cohort details</h2>
              <div className="sales-batch">
                <div className="sales-batch__head">
                  <h3 className="sales-batch__title">{featuredBatch.title}</h3>
                  <span className={batchStatusBadgeClass(featuredBatch.status)}>
                    {batchStatusLabel(featuredBatch.status)}
                  </span>
                </div>
                <dl className="sales-batch__facts">
                  <div>
                    <dt>Course dates</dt>
                    <dd>
                      {formatSalesDate(featuredBatch.start_date)} → {formatSalesDate(featuredBatch.end_date)}
                    </dd>
                  </div>
                  {featuredBatch.instructor_name ? (
                    <div>
                      <dt>Instructor</dt>
                      <dd className="sales-batch__instructor">
                        <span className="sales-batch__avatar" aria-hidden="true">
                          {instructorInitial(featuredBatch.instructor_name)}
                        </span>
                        {featuredBatch.instructor_name}
                      </dd>
                    </div>
                  ) : null}
                  {featuredBatch.schedule_label ? (
                    <div>
                      <dt>Schedule</dt>
                      <dd>{featuredBatch.schedule_label}</dd>
                    </div>
                  ) : null}
                  {featuredBatch.timezone ? (
                    <div>
                      <dt>Timezone</dt>
                      <dd>{formatTimezoneLabel(featuredBatch.timezone)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Admissions</dt>
                    <dd>
                      {admissionBadgeLabel(course.admission_status)}
                      {course.enrollment_message ? ` — ${course.enrollment_message}` : ''}
                    </dd>
                  </div>
                  {(course.start_date || course.end_date) && (
                    <div>
                      <dt>Course duration</dt>
                      <dd>
                        {formatSalesDate(course.start_date) || '—'} →{' '}
                        {formatSalesDate(course.end_date) || '—'}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Seats</dt>
                    <dd>
                      {featuredBatch.seats_remaining} of {featuredBatch.total_seats} available
                    </dd>
                  </div>
                </dl>
              </div>

              {batches.length > 1 ? (
                <div className="sales-batch-list">
                  <h3 className="sales-batch-list__title">All upcoming cohorts</h3>
                  <ul>
                    {batches.map((b) => (
                      <li key={b.id}>
                        <strong>{b.title}</strong>
                        <span>
                          {formatSalesDate(b.start_date)} – {formatSalesDate(b.end_date)} ·{' '}
                          {batchStatusLabel(b.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* How it works */}
        <section className="sales-section sales-section--muted">
          <div className="container container-narrow">
            <h2 className="sales-section__title">How this course works</h2>
            <ol className="how-list">
              <li>
                <span className="how-list__step">1</span>
                <div>
                  <h3 className="heading-4">Watch the lectures</h3>
                  <p className="body-md">
                    Topic-by-topic videos arranged in the right learning order. No decision fatigue — just press play.
                  </p>
                </div>
              </li>
              <li>
                <span className="how-list__step">2</span>
                <div>
                  <h3 className="heading-4">Take chapter tests</h3>
                  <p className="body-md">
                    Timed MCQs with auto-grading and detailed explanations after every submission.
                  </p>
                </div>
              </li>
              <li>
                <span className="how-list__step">3</span>
                <div>
                  <h3 className="heading-4">Ask your doubts</h3>
                  <p className="body-md">
                    Tag your question by topic. Your teacher answers it in your dashboard — no public chats, no noise.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="sales-cta">
          <div className="container">
            <div className="sales-cta__inner">
              <div>
                <h2 className="sales-cta__title">
                  {featuredBatch?.start_date
                    ? `Start ${formatSalesDate(featuredBatch.start_date)} — enroll today`
                    : `Ready to start ${course.title}?`}
                </h2>
                <p className="sales-cta__text">{enrollPitch}</p>
              </div>
              <div className="sales-cta__aside">
                {pricingDisplay && !pricingDisplay.isFree ? (
                  <p className="sales-cta__price">
                    {formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency)}
                    {pricingDisplay.original ? (
                      <span>{formatSalesAmount(pricingDisplay.original, pricingDisplay.currency)}</span>
                    ) : null}
                  </p>
                ) : null}
                <CourseEnrollmentCtaButton
                  courseId={routeId}
                  labelContext="bottom"
                  size="lg"
                  courseAdmission={courseAdmission}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Mobile sticky bar */}
        <div className="sales-sticky-bar" aria-hidden={false}>
          <div className="sales-sticky-bar__price">
            {pricingDisplay?.isFree ? (
              <strong>Free</strong>
            ) : pricingDisplay ? (
              <>
                <strong>{formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency)}</strong>
                {pricingDisplay.original ? (
                  <span>{formatSalesAmount(pricingDisplay.original, pricingDisplay.currency)}</span>
                ) : null}
              </>
            ) : null}
          </div>
          <CourseEnrollmentCtaButton
            courseId={routeId}
            labelContext="sticky"
            size="md"
            courseAdmission={courseAdmission}
          />
        </div>
      </article>
    </PageLayout>
  );
}
