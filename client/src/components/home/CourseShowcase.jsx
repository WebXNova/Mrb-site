import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { catalogApi } from '../../api/catalogApi';
import CourseEnrollmentCtaButton from '../course/CourseEnrollmentCtaButton';
import { buildPricingDisplay } from '../../course/coursePresentation';
import { isAdmissionOpen } from '../../course/courseAdmissionPresentation';
import { buildTrustBadges, formatSalesAmount, formatSalesDate, pickFeaturedBatch } from '../../course/courseSalesPage';
import { formatCourseDuration, formatCourseTypeLabel, isCatalogCourseFree } from '../../course/courseDiscovery';
import { getCourseTitleInitials, pickCourseThumbnailUrl } from '../../course/courseThumbnail';
import './CourseShowcase.css';

function asList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.subjects)) return payload.subjects;
  if (Array.isArray(payload?.batches)) return payload.batches;
  return [];
}

function mergeCourseDetail(base, extra) {
  const merged = { ...(base || {}), ...(extra || {}) };
  const url = pickCourseThumbnailUrl(extra) || pickCourseThumbnailUrl(base);
  if (url) merged.thumbnail_url = url;
  return merged;
}

export function CourseShowcaseSkeleton() {
  return (
    <article className="course-showcase course-showcase--skeleton" aria-hidden="true">
      <div className="course-showcase__visual">
        <div className="course-showcase__pulse course-showcase__pulse--media" />
      </div>
      <div className="course-showcase__copy">
        <div className="course-showcase__pulse course-showcase__pulse--badge" />
        <div className="course-showcase__pulse course-showcase__pulse--title" />
        <div className="course-showcase__pulse course-showcase__pulse--line" />
        <div className="course-showcase__pulse course-showcase__pulse--line course-showcase__pulse--line-short" />
        <div className="course-showcase__pulse-row">
          <div className="course-showcase__pulse course-showcase__pulse--meta" />
          <div className="course-showcase__pulse course-showcase__pulse--meta" />
          <div className="course-showcase__pulse course-showcase__pulse--meta" />
        </div>
        <div className="course-showcase__pulse-row">
          <div className="course-showcase__pulse course-showcase__pulse--chip" />
          <div className="course-showcase__pulse course-showcase__pulse--chip" />
          <div className="course-showcase__pulse course-showcase__pulse--chip" />
        </div>
        <div className="course-showcase__pulse-row">
          <div className="course-showcase__pulse course-showcase__pulse--btn" />
          <div className="course-showcase__pulse course-showcase__pulse--btn" />
        </div>
      </div>
    </article>
  );
}

export default function CourseShowcase({ course, isCurrent = false }) {
  const reduceMotion = useReducedMotion();
  const [detail, setDetail] = useState(course);
  const [batches, setBatches] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [imageFailed, setImageFailed] = useState(false);
  const [hydrating, setHydrating] = useState(Boolean(course?.id));

  useEffect(() => {
    if (!course?.id) {
      setDetail(course);
      setHydrating(false);
      return undefined;
    }

    let cancelled = false;
    setDetail(course);
    setImageFailed(false);
    setHydrating(true);

    (async () => {
      try {
        const [detailRes, batchRes, subjectRes] = await Promise.all([
          catalogApi.getCourse(course.id),
          catalogApi.listCourseBatches(course.id).catch(() => ({ data: [] })),
          catalogApi.listCourseSubjects(course.id).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setDetail(mergeCourseDetail(course, detailRes?.data || course));
        setBatches(asList(batchRes?.data ?? batchRes));
        setSubjects(asList(subjectRes?.data ?? subjectRes));
      } catch {
        if (!cancelled) {
          setDetail(course);
        }
      } finally {
        if (!cancelled) setHydrating(false);
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
  const thumbnailUrl = pickCourseThumbnailUrl(detail);
  const showImage = Boolean(thumbnailUrl) && !imageFailed;
  const title = detail?.title || 'Course';
  const initials = getCourseTitleInitials(title);
  const description = detail?.summary || detail?.short_description || detail?.description || '';
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

  const metaItems = [];
  if (detail) {
    metaItems.push({ label: 'Type', value: formatCourseTypeLabel(detail) });
    if (pricingDisplay) {
      metaItems.push({
        label: 'Price',
        value: pricingDisplay.isFree
          ? 'Free'
          : formatSalesAmount(pricingDisplay.amount, pricingDisplay.currency),
      });
    }
    if (subjects.length > 0) {
      metaItems.push({
        label: 'Units',
        value: `${subjects.length} subject${subjects.length === 1 ? '' : 's'}`,
      });
    } else if (duration) {
      metaItems.push({ label: 'Duration', value: duration });
    } else if (detail.start_date) {
      metaItems.push({ label: 'Starts', value: formatSalesDate(detail.start_date) });
    }
  }

  const enter = reduceMotion
    ? { opacity: 1, y: 0 }
    : { opacity: 0, y: 16 };
  const entered = { opacity: 1, y: 0 };

  if (!detail) return null;
  if (hydrating && !detail.title) return <CourseShowcaseSkeleton />;

  return (
    <motion.article
      className={`course-showcase${isCurrent ? ' course-showcase--current' : ''}`}
      initial={enter}
      animate={entered}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div className="course-showcase__visual">
        <div className="course-showcase__media">
          {showImage ? (
            <img
              src={thumbnailUrl}
              alt={title}
              width={800}
              height={500}
              loading="lazy"
              decoding="async"
              className="course-showcase__image"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="course-showcase__fallback" aria-hidden="true">
              <span>{initials}</span>
            </div>
          )}
          <div className="course-showcase__overlay" aria-hidden="true" />
          {isCurrent ? (
            <span className="course-showcase__badge">Your current course</span>
          ) : (
            <span className="course-showcase__badge course-showcase__badge--spotlight">Course spotlight</span>
          )}
        </div>
      </div>

      <div className="course-showcase__copy">
        <h3 className="course-showcase__title">{title}</h3>
        {description ? <p className="course-showcase__lead">{description}</p> : null}

        {metaItems.length > 0 ? (
          <dl className="course-showcase__facts">
            {metaItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {subjectTitles.length > 0 ? (
          <ul className="course-showcase__topics">
            {subjectTitles.map((subjectTitle, index) => (
              <motion.li
                key={subjectTitle}
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05, duration: 0.3, ease: 'easeOut' }}
              >
                {subjectTitle}
              </motion.li>
            ))}
          </ul>
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
          <CourseEnrollmentCtaButton
            courseId={detail.id}
            course={detail}
            courseTitle={title}
            isFreeCourse={isCatalogCourseFree(detail)}
            labelContext="hero"
            size="lg"
            courseAdmission={courseAdmission}
            className="course-showcase__cta"
          />
          <Link to={`/courses/${encodeURIComponent(String(detail.id))}`} className="course-showcase__view">
            View Course
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
