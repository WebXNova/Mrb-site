/**
 * Shown when a test is published — mutations are blocked server-side; UI is view-only.
 */
export default function PublishedTestReadOnlyBanner() {
  return (
    <div className="admin-test-alert admin-test-alert--info" role="status">
      <strong>Published — read only.</strong> You can review content here; duplicate the test to make changes.
    </div>
  );
}
