import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../../api/catalogApi';
import CourseEnrollmentCtaButton from '../course/CourseEnrollmentCtaButton';
import { buildPricingDisplay } from '../../course/coursePresentation';
import { isAdmissionOpen } from '../../course/courseAdmissionPresentation';
import { buildTrustBadges, formatSalesAmount, formatSalesDate, pickFeaturedBatch } from '../../course/courseSalesPage';
import { formatCourseDuration, isCatalogCourseFree } from '../../course/courseDiscovery';
import { useInView } from '../../hooks/useInView';
import './CourseShowcase.css';

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.subjects)) return payload.subjects;
  if (Array.isArray(payload?.batches)) return payload.batches;
  return [];
}

export default function CourseShowcase({ course, isCurrent = false }) {
  const [sectionRef, inView] = useInView({ threshold: 0.12 });
  const [detail, setDetail] = useState(course);
  const [batches, setBatches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!course?.id) return undefined;
    let cancelled = false;
    setDetail(course);
    setImageFailed(false);

    (async () => {
      try {
        const [detailRes, batchRes, subjectRes] = await Promise.all([
          catalogApi.getCourse(course.id),
          catalogApi.listCourseBatches(course.id).catch(() => ({ data: [] })),
          catalogApi.listCourseSubjects(course.id).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        const mapped = detailRes?.data || course;
        setDetail(mapped);
        setBatches(asList(batchRes?.data ?? batchRes));
        setSubjects(asList(subjectRes?.data ?? subjectRes));
      } catch {
        if (!cancelled) {
          setDetail(course);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [course]);

  const featuredBatch = useMemo(() => pickFeaturedBatch(batches), [batches]);
  const pricingDisplay = useMemo(() => buildPricingDisplay(detail?.pricing), [detail]);
  const trustBadges = useMemo(
    () =>
      buildTrustBadges({
        batch: featuredBatch,
        subjectsCount: subjects.length,
        pricingDisplay,
      }),
    [featuredBatch, subjects.length, pricingDisplay]
  );
  const duration = formatCourseDuration(detail?.start_date, detail?.end_date);
  const admissionsOpen = detail ? isAdmissionOpen(detail) : false;
  const thumbnailUrl = detail?.thumbnail_url;
  const showImage = Boolean(thumbnailUrl) && !imageFailed;
  const categories = Array.isArray(detail?.categories) ? detail.categories : [];
  const subjectTitles = subjects
    .map((row) => row.title || row.name)
    .filter(Boolean)
    .slice(0, 8);
  const courseAdmission = detail
    ? {
        admission_status: detail.admission_status,
        is_enrollment_open: detail.is_enrollment_open,
        enrollment_message: detail.enrollment_message,
        start_date: detail.start_date,
        end_date: detail.end_date,
      }
    : null;

  if (!detail) return null;

  return (
    <article
      ref={sectionRef}
      className={`course-showcase${inView ? ' course-showcase--visible' : ''}${isCurrent ? ' course-showcase--current' : ''}`}
    >
      <div className="course-showcase__visual">
        {showImage ? (
          <img
            src={thumbnailUrl}
            alt={`${detail.title} course`}
            width={800}
            height={500}
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="course-showcase__fallback" aria-hidden="true">
            {String(detail.title || 'C').slice(0, 1)}
          </div>
        )}
      </div>

      <div className="course-showcase__copy">
        <p className="course-showcase__eyebrow">
          {isCurrent ? 'Your current course' : 'Course spotlight'}
        </p>
        <h3 className="course-showcase__title">{detail.title}</h3>
        {detail.summary ? <p className="course-showcase__lead">{detail.summary}</p> : null}

        {categories.length > 0 ? (
          <p className="course-showcase__audience">
            For {categories.map((category) => category.name).filter(Boolean).join(', ')}
          </p>
        ) : null}

        <dl className="course-showcase__facts">
          <div>
            <dt>Type</dt>
            <dd>{isCatalogCourseFree(detail) ? 'Free' : 'Paid'}</dd>
          </div>
          {pricingDisplay && !pricingDisplay.isFree ? (
            <div>
              <dt>Price</dt>
              <dd>{formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency)}</dd>
            </div>
          ) : null}
          {duration ? (
            <div>
              <dt>Duration</dt>
              <dd>{duration}</dd>
            </div>
          ) : null}
          {detail.start_date ? (
            <div>
              <dt>Starts</dt>
              <dd>{formatSalesDate(detail.start_date)}</dd>
            </div>
          ) : null}
          {subjects.length > 0 ? (
            <div>
              <dt>Units</dt>
              <dd>
                {subjects.length} subject{subjects.length === 1 ? '' : 's'}
              </dd>
            </div>
          ) : null}
          {featuredBatch?.instructor_name ? (
            <div>
              <dt>Instructor</dt>
              <dd>{featuredBatch.instructor_name}</dd>
            </div>
          ) : null}
        </dl>

        {subjectTitles.length > 0 ? (
          <div className="course-showcase__topics">
            <h4>What you&apos;ll study</h4>
            <ul>
              {subjectTitles.map((title) => (
                <li key={title}>{title}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {trustBadges.length > 0 ? (
          <ul className="course-showcase__perks">
            {trustBadges.map((badge) => (
              <li key={badge.id}>{badge.label}</li>
            ))}
          </ul>
        ) : null}

        {!admissionsOpen && detail.enrollment_message ? (
          <p className="course-showcase__note">{detail.enrollment_message}</p>
        ) : null}

        <div className="course-showcase__actions">
          <Link to={`/courses/${encodeURIComponent(String(detail.id))}`} className="course-showcase__view">
            View Course
          </Link>
          <CourseEnrollmentCtaButton
            courseId={detail.id}
            course={detail}
            courseTitle={detail.title}
            isFreeCourse={isCatalogCourseFree(detail)}
            labelContext="hero"
            size="lg"
            courseAdmission={courseAdmission}
          />
        </div>
      </div>
    </article>
  );
}
