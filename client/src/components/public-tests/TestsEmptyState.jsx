import { Link } from 'react-router-dom';
import { IconInbox } from './testsUiIcons.jsx';
import './TestsEmptyState.css';

export default function TestsEmptyState({ title, body, actionTo, actionLabel }) {
  return (
    <div className="tests-empty" role="status">
      <span className="tests-empty__icon">
        <IconInbox />
      </span>
      <h3 className="tests-empty__title">{title}</h3>
      <p className="tests-empty__body">{body}</p>
      {actionTo && actionLabel ? (
        <Link className="tests-empty__cta" to={actionTo}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
