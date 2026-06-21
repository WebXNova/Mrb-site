/**
 * Shown when a test is published — mutations are blocked server-side; UI is view-only.
 */
export default function PublishedTestReadOnlyBanner() {
  return (
    <p className="admin-test-alert admin-test-alert--info" role="status">
      This test is published and read-only. You can review content here; duplicate the test to make changes.
    </p>
  );
}
