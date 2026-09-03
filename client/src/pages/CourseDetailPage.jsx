import { Link, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import CourseEnrollmentCtaButton from '../components/course/CourseEnrollmentCtaButton';
import CourseCategoryChips from '../components/course/CourseCategoryChips';
import CourseAudiencePanel from '../components/course/CourseAudiencePanel';
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
  buildStartHeadline,
  buildTrustBadges,
  computeDiscountPercent,
  formatSalesAmount,
  formatSalesDate,
  formatSalesDateLong,
  formatTimezoneLabel,
  pickFeaturedBatch,
  resolveActiveCountdown,
} from '../course/courseSalesPage';
import './CourseDetailPage.css';

function levelBadgeLabel(level) {
  const raw = String(level || 'beginner').trim().toLowerCase();
  if (!raw) return 'Beginner';
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)} difficulty`;
}

function levelBadgeTone(level) {
  const l = String(level || 'beginner').toLowerCase();
  if (l === 'advanced') return 'warning';
  return 'neutral';
}

function instructorInitial(name) {
  const t = String(name || '').trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

function PricingCard({ pricingDisplay, courseId, courseAdmission, courseTitle }) {
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
          <span className="sales-pricing__current">
            {formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency)}
          </span>
          {pricingDisplay.original ? (
            <span className="sales-pricing__original">
              {formatSalesAmount(pricingDisplay.original, pricingDisplay.currency)}
            </span>
          ) : null}
        </div>
      )}
      <div className="sales-pricing__actions">
        <CourseEnrollmentCtaButton
          courseId={courseId}
          courseTitle={courseTitle}
          isFreeCourse={Boolean(pricingDisplay?.isFree)}
          labelContext="pricing"
          size="lg"
          fullWidth
          courseAdmission={courseAdmission}
        />
      </div>
    </div>
  );
}

function TrustChipRow({ badges }) {
  if (!badges.length) return null;
  return (
    <ul className="sales-trust-chips" aria-label="Course highlights">
      {badges.map((badge) => (
        <li key={badge.id} className="sales-trust-chip">
          <span className="sales-trust-chip__icon" aria-hidden="true">
            ✓
          </span>
          <span className="sales-trust-chip__label">{badge.label}</span>
        </li>
      ))}
    </ul>
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

function ScheduleMeta({ batch, course, admissionsOpen }) {
  if (!batch) return null;
  const total = Number(batch.total_seats ?? 0);
  const remaining = Number(batch.seats_remaining ?? 0);

  return (
    <dl className="sales-schedule-meta">
      {batch.instructor_name ? (
        <div className="sales-schedule-meta__item">
          <dt>Instructor</dt>
          <dd className="sales-schedule-meta__instructor">
            <span className="sales-schedule-meta__avatar" aria-hidden="true">
              {instructorInitial(batch.instructor_name)}
            </span>
            {batch.instructor_name}
          </dd>
        </div>
      ) : null}
      {batch.schedule_label ? (
        <div className="sales-schedule-meta__item">
          <dt>Schedule</dt>
          <dd>{batch.schedule_label}</dd>
        </div>
      ) : null}
      {batch.timezone ? (
        <div className="sales-schedule-meta__item">
          <dt>Timezone</dt>
          <dd>{formatTimezoneLabel(batch.timezone)}</dd>
        </div>
      ) : null}
      {total > 0 ? (
        <div className="sales-schedule-meta__item">
          <dt>Seats</dt>
          <dd>
            {remaining} of {total} available
          </dd>
        </div>
      ) : null}
      <div className="sales-schedule-meta__item">
        <dt>Admissions</dt>
        <dd>
          {admissionBadgeLabel(course.admission_status)}
          {course.enrollment_message ? ` — ${course.enrollment_message}` : ''}
        </dd>
      </div>
      {!admissionsOpen && course.enrollment_message ? (
        <div className="sales-schedule-meta__item sales-schedule-meta__item--full">
          <dt>Status</dt>
          <dd>{course.enrollment_message}</dd>
        </div>
      ) : null}
    </dl>
  );
}

function CurriculumAccordion({ subjects }) {
  if (!subjects.length) return null;
  return (
    <ol className="sales-curriculum-accordion">
      {subjects.map((subject, index) => (
        <li key={subject.id} className="sales-curriculum-accordion__item">
          <details className="sales-curriculum-accordion__details" open={subjects.length === 1}>
            <summary className="sales-curriculum-accordion__summary">
              <span className="sales-curriculum-accordion__index" aria-hidden="true">
                {index + 1}
              </span>
              <span className="sales-curriculum-accordion__icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                </svg>
              </span>
              <span className="sales-curriculum-accordion__title">{subject.title}</span>
              <span className="sales-curriculum-accordion__chevron" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </summary>
            {subject.description ? (
              <div className="sales-curriculum-accordion__body">
                <p>{subject.description}</p>
              </div>
            ) : null}
          </details>
        </li>
      ))}
    </ol>
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

  const startHeadline = useMemo(() => buildStartHeadline(featuredBatch), [featuredBatch]);
  const activeCountdown = useMemo(() => resolveActiveCountdown(featuredBatch), [featuredBatch]);
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
                <div className="sales-hero__meta">
                  <CourseCategoryChips categories={course.categories} />
                  <div className="sales-hero__badges">
                    <Badge tone={levelBadgeTone(course.level)} size="lg">
                      {levelBadgeLabel(course.level)}
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
                </div>

                <h1 className="sales-hero__title">{course.title}</h1>
                <p className="sales-hero__lead">{course.summary}</p>

                <TrustChipRow badges={trustBadges} />
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
                  courseTitle={course.title}
                  courseAdmission={courseAdmission}
                />
              </aside>
            </div>
          </div>
        </section>

        <CourseAudiencePanel
          categories={course.categories}
          course={course}
          admissionsOpen={admissionsOpen}
        />

        {/* Schedule — single consolidated section */}
        {featuredBatch ? (
          <section className="sales-schedule" aria-label="Schedule and cohort">
            <div className="container">
              <div className="sales-schedule__header">
                <div>
                  <h2 className="sales-section__title">Schedule &amp; cohort</h2>
                  {startHeadline ? (
                    <p className="sales-schedule__subtitle">{startHeadline}</p>
                  ) : null}
                </div>
                {featuredBatch.title ? (
                  <div className="sales-schedule__cohort-label">
                    <span className={batchStatusBadgeClass(featuredBatch.status)}>
                      {batchStatusLabel(featuredBatch.status)}
                    </span>
                    <span className="sales-schedule__cohort-name">{featuredBatch.title}</span>
                  </div>
                ) : null}
              </div>

              <div className="sales-schedule__grid">
                <CohortTimeline batch={featuredBatch} course={course} />
                <ScheduleMeta
                  batch={featuredBatch}
                  course={course}
                  admissionsOpen={admissionsOpen}
                />
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

        {/* About */}
        {course.description ? (
          <section className="sales-section">
            <div className="container container-narrow">
              <h2 className="sales-section__title">About this course</h2>
              <div className="sales-prose">{course.description}</div>
            </div>
          </section>
        ) : null}

        {/* Curriculum */}
        {subjects.length > 0 ? (
          <section className="sales-section sales-section--muted">
            <div className="container container-narrow">
              <h2 className="sales-section__title">What you&apos;ll study</h2>
              <p className="sales-section__subtitle">
                {subjects.length} structured unit{subjects.length === 1 ? '' : 's'} in this program
              </p>
              <CurriculumAccordion subjects={subjects} />
            </div>
          </section>
        ) : null}

        {/* How it works */}
        <section className="sales-section">
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
                <p className="sales-cta__text">
                  {admissionsOpen
                    ? 'Secure your seat and begin learning with structured support from MRB Classes.'
                    : 'Browse our catalog or check back when enrollment opens.'}
                </p>
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
                  course={course}
                  courseTitle={course.title}
                  isFreeCourse={Boolean(pricingDisplay?.isFree)}
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
            course={course}
            courseTitle={course.title}
            isFreeCourse={Boolean(pricingDisplay?.isFree)}
            labelContext="sticky"
            size="md"
            courseAdmission={courseAdmission}
          />
        </div>
      </article>
    </PageLayout>
  );
}
