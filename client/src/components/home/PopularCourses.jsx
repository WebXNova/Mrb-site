import { Link } from 'react-router-dom';
import { courses } from '../../data/courses';
import CourseCard from '../ui/CourseCard';
import Button from '../ui/Button';
import './PopularCourses.css';

export default function PopularCourses() {
  const featured = courses;

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

        <div className="grid-cards">
          {featured.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </div>
    </section>
  );
}
