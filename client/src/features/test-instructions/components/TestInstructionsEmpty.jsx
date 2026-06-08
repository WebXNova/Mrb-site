import { Link } from 'react-router-dom';

export default function TestInstructionsEmpty({ slug }) {
  return (
    <div className="ti-state ti-state--empty">
      <h2 className="ti-state__title">Test not available</h2>
      <p className="ti-state__message">
        This test could not be found, is not published yet, or has no questions assigned.
        {slug ? (
          <>
            {' '}
            Link:{' '}
            <span className="ti-slug" translate="no">
              /tests/{slug}
            </span>
          </>
        ) : null}
      </p>
      <Link to="/" className="btn btn--secondary">
        Back to website
      </Link>
    </div>
  );
}
