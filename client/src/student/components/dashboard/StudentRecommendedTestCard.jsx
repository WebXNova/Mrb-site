import { Link } from 'react-router-dom';

import StudentRippleButton from './StudentRippleButton';



export default function StudentRecommendedTestCard({ test }) {

  const startHref = test?.slug ? `/tests/${test.slug}` : '/dashboard/tests';



  return (

    <article className={`sp-panel sp-card sp-card--highlight sp-card--interactive sp-animate-in sp-animate-in--4${test ? '' : ' sp-panel--empty'}`}>

      <p className="sp-label">Recommended next</p>

      <h2 className="sp-panel__title">Practice test</h2>



      {test ? (

        <>

          <p className="sp-panel__headline">{test.title}</p>

          <p className="sp-body">

            {[test.subject, test.durationMinutes ? `${test.durationMinutes} min` : null]

              .filter(Boolean)

              .join(' · ')}

          </p>

          <StudentRippleButton to={startHref} className="sp-btn sp-btn--primary sp-btn--full sp-mt-4">

            Start test

          </StudentRippleButton>

        </>

      ) : (

        <>

          <p className="sp-body">No published tests yet. Check back soon for new practice sets.</p>

          <Link className="sp-btn sp-btn--secondary sp-mt-4" to="/dashboard/tests">

            Browse tests

          </Link>

        </>

      )}

    </article>

  );

}

