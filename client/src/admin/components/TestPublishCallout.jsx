import { Link } from 'react-router-dom';

/**
 * Prominent publish CTA — clarifies Public access mode ≠ publish.
 */
export default function TestPublishCallout({
  onPublish,
  publishing = false,
  blocked = false,
  blockMessage = '',
  fixTo = null,
  fixLabel = 'Open Questions',
}) {
  return (
    <div
      className={`admin-publish-callout${blocked ? ' admin-publish-callout--blocked' : ''}`}
      role="region"
      aria-label={blocked ? 'Publish blocked' : 'Publish test'}
    >
      {blocked ? (
        <>
          <p className="admin-publish-callout__text">
            <strong>Cannot publish yet.</strong>{' '}
            {blockMessage || 'Fix the issues below, then try again.'}
          </p>
          {fixTo ? (
            <Link className="btn btn--secondary admin-publish-callout__btn" to={fixTo}>
              {fixLabel}
            </Link>
          ) : null}
        </>
      ) : (
        <>
          <p className="admin-publish-callout__text">
            <strong>Publish test</strong> makes this exam live for students and creates the shareable link.
            Setting access mode to <strong>Public</strong> in Settings only controls who can take it{' '}
            <em>after</em> you publish — it does not publish by itself.
          </p>
          <button
            type="button"
            className="btn btn--primary admin-publish-callout__btn"
            onClick={onPublish}
            disabled={publishing}
            aria-busy={publishing || undefined}
          >
            {publishing ? 'Publishing…' : 'Review & publish'}
          </button>
        </>
      )}
    </div>
  );
}
