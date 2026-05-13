import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../../api/catalogApi';
import CourseCard from '../ui/CourseCard';
import Button from '../ui/Button';
import { mapCatalogCourseToCardProps } from '../../course/coursePresentation';
import './PopularCourses.css';

export default function PopularCourses() {
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await catalogApi.listCourses();
        const rows = Array.isArray(res?.data) ? res.data : [];
        if (!cancelled) {
          setCourses(rows.map(mapCatalogCourseToCardProps).filter(Boolean));
        }
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load courses');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const featured = courses.slice(0, 6);

  return (
    <section className="section popular-courses">
      <div className="container">
        <div className="popular-courses__head">
          <div className="popular-courses__head-left">
            <span className="eyebrow">Popular this season</span>
            <h2 className="heading-1 text-balance">Courses students are loving.</h2>
          </div>
          <Button as={Link} to="/courses" variant="link" size="md">
            View all courses →
          </Button>
        </div>

        {error ? (
          <p className="body-md" style={{ color: 'var(--color-text-muted, #6b7280)' }}>
            {error}
          </p>
        ) : null}

        <div className="grid-cards">
          {featured.length ? (
            featured.map((course) => <CourseCard key={String(course.id)} course={course} />)
          ) : (
            <p className="body-md" style={{ gridColumn: '1 / -1', color: 'var(--color-text-muted, #6b7280)' }}>
              No published courses yet. Add one in the admin dashboard.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
