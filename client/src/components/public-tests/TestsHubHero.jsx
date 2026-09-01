import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { getStudentToken } from '../../auth/session';
import { withSafeFromQuery } from '../../utils/authRedirect';
import { MY_RESULTS_PATH } from '../../utils/myResultsPaths';
import './TestsHubHero.css';

export default function TestsHubHero() {
  const loggedIn = Boolean(getStudentToken());
  const myResultsTo = loggedIn ? MY_RESULTS_PATH : withSafeFromQuery('/login', MY_RESULTS_PATH);

  return (
    <section className="tests-hero" aria-labelledby="tests-hero-heading">
      <div className="container tests-hero__inner">
        <div className="tests-hero__copy">
          <span className="eyebrow tests-hero__eyebrow">Tests</span>
          <h1 id="tests-hero-heading" className="heading-1 tests-hero__title text-balance">
            Timed practice that belongs with your MRB Classes prep.
          </h1>
          <p className="body-lg text-pretty tests-hero__lead">
            Start a free practice test, or register independently for a paid examination. Course
            enrolment is not required.
          </p>
          <div className="tests-hero__actions">
            <Button as={Link} to={myResultsTo} variant="primary">
              My Results
            </Button>
            <Button as="a" href="#free-tests" variant="secondary">
              Explore free tests
            </Button>
          </div>
        </div>

        <nav className="tests-hub-nav" aria-label="Test sections">
          <a className="tests-hub-nav__link" href="#free-tests">
            Free Tests
          </a>
          <a className="tests-hub-nav__link" href="#paid-tests">
            Paid Tests
          </a>
          <Link className="tests-hub-nav__link" to={myResultsTo}>
            My Results
          </Link>
        </nav>
      </div>
    </section>
  );
}
