import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { catalogApi } from '../api/catalogApi';
import { buildPricingDisplay, mapCatalogCourseToDetailProps } from '../course/coursePresentation';
import { batchStatusBadgeClass, batchStatusLabel, enrollmentStatusSummary, formatSeatLine } from '../course/batchPresentation';
import './CourseDetailPage.css';

function levelBadgeTone(level) {
  const l = String(level || 'beginner').toLowerCase();
  if (l === 'advanced') return 'warning';
  return 'neutral';
}

function formatAmount(amount, currency) {
  return `${currency || 'PKR'} ${Number(amount || 0).toLocaleString('en-PK')}`;
}

export default function CourseDetailPage() {
  const { id: routeId } = useParams();
  const [course, setCourse] = useState(null);
  const [batches, setBatches] = useState([]);
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
        let batchList = [];
        try {
          const br = await catalogApi.listCourseBatches(courseId);
          batchList = Array.isArray(br?.data) ? br.data : [];
        } catch {
          batchList = [];
        }
        if (!cancelled) {
          setCourse(raw ? mapCatalogCourseToDetailProps(raw) : null);
          setBatches(batchList);
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

  if (loading) {
    return (
      <PageLayout>
        <section className="section">
          <div className="container container-narrow">
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

  const showCoverImage = Boolean(course.thumbnail_url);
  const thumbnailUrl = course.thumbnail_url || '';
  const pricingDisplay = buildPricingDisplay(course.pricing);

  return (
    <PageLayout>
      <section className="course-detail-hero">
        <div className="container">
          <nav aria-label="Breadcrumb" className="breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/courses">Courses</Link>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb__current">{course.title}</span>
          </nav>

          <div className="course-detail-hero__grid">
            <div className="course-detail-hero__main">
              <div className="cluster">
                <Badge tone={levelBadgeTone(course.level)} size="lg">
                  {course.level}
                </Badge>
              </div>

              <h1 className="heading-1 text-balance course-detail-hero__title">{course.title}</h1>
              <p className="body-lg text-pretty course-detail-hero__lead">{course.summary}</p>
            </div>

            <aside className="course-detail-hero__card">
              <div className="course-detail-hero__card-cover">
                {showCoverImage ? (
                  <img
                    className="course-detail-hero__card-cover-image"
                    src={thumbnailUrl}
                    alt=""
                    loading="eager"
                    decoding="async"
                    sizes="(max-width: 1024px) 100vw, 360px"
                  />
                ) : null}
                <div className="course-detail-hero__card-pattern" aria-hidden="true" />
              </div>

              <div className="course-detail-hero__card-body">
                {pricingDisplay ? (
                  <div className="course-detail-hero__card-pricing">
                    {pricingDisplay.isFree ? (
                      <span className="course-detail-hero__card-pricing-current">Free</span>
                    ) : (
                      <>
                        <span className="course-detail-hero__card-pricing-current">
                          {formatAmount(pricingDisplay.amount, pricingDisplay.currency)}
                        </span>
                        {pricingDisplay.original ? (
                          <span className="course-detail-hero__card-pricing-original">
                            {formatAmount(pricingDisplay.original, pricingDisplay.currency)}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
                <div className="course-detail-hero__card-actions">
                  <Button as={Link} to="/enroll" variant="accent" size="lg" fullWidth>
                    Enroll now
                  </Button>
                  <Button as={Link} to="/courses" variant="secondary" size="md" fullWidth>
                    Browse other courses
                  </Button>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section course-detail-content">
        <div className="container container-narrow">
          <div className="course-detail-content__block">
            <h2 className="heading-2">About this course</h2>
            <p className="body-md" style={{ whiteSpace: 'pre-wrap' }}>
              {course.description || course.summary}
            </p>
          </div>

          <div className="course-detail-content__block">
            <h2 className="heading-2">Upcoming cohorts</h2>
            {batches.length ? (
              <div className="course-batches">
                {batches.map((b) => (
                  <article key={b.id} className="course-batch-card">
                    <div className="course-batch-card__head">
                      <h3 className="course-batch-card__title">{b.title}</h3>
                      <span className={batchStatusBadgeClass(b.status)}>{batchStatusLabel(b.status)}</span>
                      <code style={{ fontSize: '0.85rem', color: 'var(--color-ink-500)' }}>{b.code}</code>
                    </div>
                    <div className="course-batch-card__meta">
                      <p className="body-md" style={{ margin: 0 }}>
                        <strong>Dates:</strong> {b.start_date} → {b.end_date}
                      </p>
                      <p className="body-md" style={{ margin: 0 }}>
                        <strong>Seats:</strong> {formatSeatLine(b)}
                      </p>
                      <p className="body-md" style={{ margin: 0 }}>
                        <strong>Enrollment:</strong> {enrollmentStatusSummary(b)}
                      </p>
                      {b.instructor_name ? (
                        <p className="body-md" style={{ margin: 0 }}>
                          <strong>Instructor:</strong> {b.instructor_name}
                        </p>
                      ) : null}
                      {b.schedule_label ? (
                        <p className="body-md" style={{ margin: 0 }}>
                          <strong>Schedule:</strong> {b.schedule_label} ({b.timezone})
                        </p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="body-md">No open cohorts are listed for this course right now.</p>
            )}
          </div>

          <div className="course-detail-content__block">
            <h2 className="heading-2">How this course works</h2>
            <ol className="how-list">
              <li>
                <span className="how-list__step">1</span>
                <div>
                  <h3 className="heading-4">Watch the lectures</h3>
                  <p className="body-md">
                    Topic-by-topic videos arranged in the right learning order. No decision fatigue — just press
                    play.
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
                    Tag your question by topic. Your teacher answers it in your dashboard — no public chats,
                    no noise.
                  </p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
