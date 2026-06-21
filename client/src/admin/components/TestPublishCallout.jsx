/**
 * Prominent publish CTA — clarifies Public access mode ≠ publish.
 */
export default function TestPublishCallout({ onPublish, publishing = false }) {
  return (
    <div className="admin-publish-callout" role="region" aria-label="Publish test">
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
    </div>
  );
}
