import { Link } from 'react-router-dom';

export default function TestInstructionsEmpty() {
  return (
    <div className="ti-state ti-state--empty">
      <h2 className="ti-state__title">This test is not available</h2>
      <p className="ti-state__message">
        If you should have access, sign in with your enrolled student account and try again. Private
        tests are not listed publicly.
      </p>
      <Link to="/" className="btn btn--secondary">
        Back to website
      </Link>
    </div>
  );
}
