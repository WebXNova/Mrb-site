import { Link, useParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { getCourseById } from '../data/courses';
import './CourseDetailPage.css';

function formatPrice(price) {
  if (price === 0) return 'Free';
  const formatted = new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 0,
  }).format(price);
  return `Rs ${formatted}`;
}

export default function CourseDetailPage() {
  const { id } = useParams();
  const course = getCourseById(id);

  if (!course) {
    return (
      <PageLayout>
        <section className="section">
          <div className="container container-narrow course-not-found">
            <h1 className="heading-1">Course not found</h1>
            <p className="body-md">
              The course you’re looking for doesn’t exist or may have been moved.
            </p>
            <Button as={Link} to="/courses" variant="primary" size="md">
              Back to all courses
            </Button>
          </div>
        </section>
      </PageLayout>
    );
  }

  const discount =
    course.originalPrice && course.originalPrice > course.price
      ? Math.round(
          ((course.originalPrice - course.price) / course.originalPrice) * 100
        )
      : 0;

  return (
    <PageLayout>
      <section className="course-detail-hero">
        <div className="container">
          <nav aria-label="Breadcrumb" className="breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden="true">/</span>
            <Link to="/courses">Courses</Link>
            <span aria-hidden="true">/</span>
            <span className="breadcrumb__current">{course.subject}</span>
          </nav>

          <div className="course-detail-hero__grid">
            <div className="course-detail-hero__main">
              <div className="cluster">
                <Badge tone={course.subject.toLowerCase()} size="lg">
                  {course.subject}
                </Badge>
                <Badge tone="neutral" size="lg">
                  {course.level}
                </Badge>
              </div>

              <h1 className="heading-1 text-balance course-detail-hero__title">
                {course.title}
              </h1>
              <p className="body-lg text-pretty course-detail-hero__lead">
                {course.summary}
              </p>

              <div className="course-detail-hero__meta">
                <div className="meta-item">
                  <span className="meta-item__icon">
                    <PlayIcon />
                  </span>
                  <div>
                    <span className="meta-item__value">{course.lecturesCount}</span>
                    <span className="meta-item__label">Lectures</span>
                  </div>
                </div>
                <div className="meta-item">
                  <span className="meta-item__icon">
                    <CheckIcon />
                  </span>
                  <div>
                    <span className="meta-item__value">{course.testsCount}</span>
                    <span className="meta-item__label">Tests</span>
                  </div>
                </div>
                <div className="meta-item">
                  <span className="meta-item__icon">
                    <ClockIcon />
                  </span>
                  <div>
                    <span className="meta-item__value">{course.durationWeeks}</span>
                    <span className="meta-item__label">Weeks</span>
                  </div>
                </div>
                <div className="meta-item">
                  <span className="meta-item__icon">
                    <UsersIcon />
                  </span>
                  <div>
                    <span className="meta-item__value">
                      {course.studentsEnrolled.toLocaleString('en-IN')}
                    </span>
                    <span className="meta-item__label">Students</span>
                  </div>
                </div>
              </div>
            </div>

            <aside className="course-detail-hero__card">
              <div
                className="course-detail-hero__card-cover"
                style={{ '--cover-accent': course.accentColor }}
              >
                {course.coverImage ? (
                  <img
                    className="course-detail-hero__card-cover-image"
                    src={course.coverImage}
                    alt={`${course.title} cover`}
                    loading="eager"
                    decoding="async"
                    sizes="(max-width: 1024px) 100vw, 360px"
                  />
                ) : null}
                <div className="course-detail-hero__card-pattern" aria-hidden="true" />
                {!course.coverImage ? (
                  <span className="course-detail-hero__card-subject">{course.subject}</span>
                ) : null}
              </div>

              <div className="course-detail-hero__card-body">
                <div className="course-detail-hero__price">
                  <span className="course-detail-hero__price-current">
                    {formatPrice(course.price)}
                  </span>
                  {course.originalPrice && course.originalPrice > course.price ? (
                    <>
                      <span className="course-detail-hero__price-original">
                        {formatPrice(course.originalPrice)}
                      </span>
                      <Badge tone="warning" size="md">
                        Save {discount}%
                      </Badge>
                    </>
                  ) : null}
                </div>

                <div className="course-detail-hero__card-actions">
                  <Button as={Link} to="/enroll" variant="accent" size="lg" fullWidth>
                    Enroll now
                  </Button>
                  <Button as={Link} to="/courses" variant="secondary" size="md" fullWidth>
                    Browse other courses
                  </Button>
                </div>

                <div className="course-detail-hero__card-meta">
                  <div className="course-detail-hero__instructor">
                    <span className="course-detail-hero__instructor-avatar">
                      {course.instructor.charAt(0)}
                    </span>
                    <div>
                      <span className="course-detail-hero__instructor-label">
                        Taught by
                      </span>
                      <span className="course-detail-hero__instructor-name">
                        {course.instructor}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section course-detail-content">
        <div className="container container-narrow">
          <div className="course-detail-content__block">
            <h2 className="heading-2">What you'll get</h2>
            <ul className="highlight-list">
              {course.highlights.map((h) => (
                <li key={h} className="highlight-list__item">
                  <span className="highlight-list__icon">
                    <CheckIcon />
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="course-detail-content__block">
            <h2 className="heading-2">How this course works</h2>
            <ol className="how-list">
              <li>
                <span className="how-list__step">1</span>
                <div>
                  <h3 className="heading-4">Watch the lectures</h3>
                  <p className="body-md">
                    Topic-by-topic videos arranged in the right learning order. No
                    decision fatigue — just press play.
                  </p>
                </div>
              </li>
              <li>
                <span className="how-list__step">2</span>
                <div>
                  <h3 className="heading-4">Take chapter tests</h3>
                  <p className="body-md">
                    Timed MCQs with auto-grading and detailed explanations after every
                    submission.
                  </p>
                </div>
              </li>
              <li>
                <span className="how-list__step">3</span>
                <div>
                  <h3 className="heading-4">Ask your doubts</h3>
                  <p className="body-md">
                    Tag your question by subject. Your teacher answers it in your
                    dashboard — no public chats, no noise.
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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4z" />
      <polygon points="10,9 16,12 10,15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
