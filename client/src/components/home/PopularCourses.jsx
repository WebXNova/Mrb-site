import { Link } from 'react-router-dom';
import { useHomeCourseDiscovery } from '../../hooks/useHomeCourseDiscovery';
import { CatalogCourseGridSkeleton } from '../catalog/CatalogCourseCardSkeleton';
import { useInView } from '../../hooks/useInView';
import PopularCourseCard from './PopularCourseCard';
import CourseShowcase from './CourseShowcase';
import './PopularCourses.css';

export default function PopularCourses() {
  const [sectionRef, inView] = useInView({ threshold: 0.08 });
  const {
    courses,
    featuredCourse,
    activeEnrollment,
    copy,
    loading,
    error,
    reload,
  } = useHomeCourseDiscovery();

  const currentCourseId = activeEnrollment?.courseId ?? null;
  const gridCourses = featuredCourse
    ? courses.filter((course) => Number(course.id) !== Number(featuredCourse.id))
    : courses;

  return (
    <section
      id="courses"
      ref={sectionRef}
      className={`popular-courses${inView ? ' popular-courses--visible' : ''}`}
      aria-labelledby="popular-courses-heading"
    >
      <div className="container popular-courses__inner">
        <header className="popular-courses__head">
          <div className="popular-courses__head-copy">
            <span className="popular-courses__eyebrow">{copy.eyebrow}</span>
            <h2 id="popular-courses-heading" className="popular-courses__title">
              {copy.title}
            </h2>
            <p className="popular-courses__lead">{copy.lead}</p>
          </div>
          <Link to="/courses" className="popular-courses__view-all">
            View all courses
            <span aria-hidden="true">→</span>
          </Link>
        </header>

        {error ? (
          <div className="popular-courses__status" role="alert">
            <p>Unable to load courses right now.</p>
            <button type="button" className="popular-courses__retry" onClick={reload}>
              Try Again
            </button>
          </div>
        ) : null}

        {loading && !error ? (
          <div className="popular-courses__loading">
            <CatalogCourseGridSkeleton count={3} />
          </div>
        ) : null}

        {!loading && !error && courses.length === 0 ? (
          <div className="popular-courses__status" role="status">
            <p>Courses are being prepared. Please check back soon.</p>
            <Link to="/courses" className="popular-courses__retry">
              View all courses
            </Link>
          </div>
        ) : null}

        {!loading && !error && featuredCourse ? (
          <CourseShowcase
            course={featuredCourse}
            isCurrent={Number(featuredCourse.id) === Number(currentCourseId)}
          />
        ) : null}

        {!loading && !error && gridCourses.length > 0 ? (
          <div className="popular-courses__group">
            <p className="popular-courses__group-label">
              {currentCourseId ? 'Explore other courses' : 'Choose your course'}
            </p>
            <div className="popular-courses__grid">
              {gridCourses.slice(0, 8).map((course, index) => (
                <PopularCourseCard
                  key={String(course.id)}
                  course={course}
                  isCurrent={Number(course.id) === Number(currentCourseId)}
                  style={{ '--card-i': index }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {!loading && !error && courses.length > 0 ? (
          <div className="popular-courses__footer">
            <Link to="/courses" className="popular-courses__view-all">
              View all courses
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
