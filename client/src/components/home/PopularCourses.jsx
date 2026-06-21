import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { catalogApi } from '../../api/catalogApi';
import { buildPricingDisplay, mapCatalogCourseToCardProps } from '../../course/coursePresentation';
import { useInView } from '../../hooks/useInView';
import PopularCourseCard from './PopularCourseCard';
import './PopularCourses.css';

const PAID_BADGES = ['Bestseller', 'New', 'Trending'];

function splitCourses(courses) {
  const paid = [];
  const free = [];

  for (const course of courses) {
    const display = buildPricingDisplay(course.pricing);
    if (display?.isFree) free.push(course);
    else paid.push(course);
  }

  return { paid, free };
}

export default function PopularCourses() {
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const [sectionRef, inView] = useInView({ threshold: 0.1 });
  const { paid, free } = useMemo(() => splitCourses(courses), [courses]);

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

  const hasCourses = paid.length > 0 || free.length > 0;

  return (
    <section
      ref={sectionRef}
      className={`popular-courses ${inView ? 'popular-courses--visible' : ''}`}
      aria-labelledby="popular-courses-heading"
    >
      <div className="popular-courses__backdrop" aria-hidden="true">
        <div className="popular-courses__glow popular-courses__glow--red" />
        <div className="popular-courses__glow popular-courses__glow--blue" />
        <div className="popular-courses__grid-bg" />
      </div>

      <div className="container popular-courses__inner">
        <header className="popular-courses__head">
          <div className="popular-courses__head-copy">
            <span className="popular-courses__eyebrow">
              <span className="popular-courses__eyebrow-bar" aria-hidden="true" />
              Popular This Season
            </span>
            <h2 id="popular-courses-heading" className="popular-courses__title">
              Courses students are loving.
            </h2>
            <p className="popular-courses__lead">
              Premium MDCAT prep and free mock tests — pick your path and start today.
            </p>
          </div>
          <Link to="/courses" className="popular-courses__view-all">
            View all courses
            <span aria-hidden="true">→</span>
          </Link>
        </header>

        {error ? <p className="popular-courses__error">{error}</p> : null}

        {!hasCourses && !error ? (
          <p className="popular-courses__empty">
            No published courses yet. Add one in the admin dashboard.
          </p>
        ) : null}

        {paid.length > 0 ? (
          <div className="popular-courses__group">
            <div className="popular-courses__group-label">
              <span className="popular-courses__group-dot popular-courses__group-dot--red" />
              Paid Courses
            </div>
            <div className="popular-courses__grid popular-courses__grid--paid">
              {paid.slice(0, 6).map((course, index) => (
                <PopularCourseCard
                  key={String(course.id)}
                  course={course}
                  badge={PAID_BADGES[index] || 'Trending'}
                  badgeTone="red"
                  buttonStyle={index === 0 ? 'primary' : 'outline'}
                  style={{ '--card-i': index }}
                />
              ))}
            </div>
          </div>
        ) : null}

        {free.length > 0 ? (
          <div className="popular-courses__free-zone" style={{ '--zone-i': paid.length }}>
            <div className="popular-courses__free-head">
              <span className="popular-courses__free-badge">FREE</span>
              <div>
                <h3 className="popular-courses__free-title">MDCAT Grand Free Tests</h3>
                <p className="popular-courses__free-desc">
                  Practice under real exam conditions — no payment required.
                </p>
              </div>
            </div>
            <div className="popular-courses__grid popular-courses__grid--free">
              {free.slice(0, 3).map((course, index) => (
                <PopularCourseCard
                  key={String(course.id)}
                  course={course}
                  badge="FREE"
                  badgeTone="blue"
                  buttonStyle="free"
                  ctaLabelOverride="Enroll Now"
                  showSubject={false}
                  style={{ '--card-i': index }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
