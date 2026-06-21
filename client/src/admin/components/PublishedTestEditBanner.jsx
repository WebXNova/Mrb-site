import { PUBLISHED_EDIT_WARNING } from '../utils/publishedTestEdit';

/**
 * Shown when editing a published test — mutations are allowed with confirmation.
 */
export default function PublishedTestEditBanner({ testTitle = '' }) {
  const heading = testTitle
    ? `Editing published test: ${testTitle}`
    : 'Editing published test';

  return (
    <div className="admin-test-alert admin-test-alert--warning" role="alert">
      <p className="admin-test-alert__title">{heading}</p>
      <p className="admin-test-alert__body">{PUBLISHED_EDIT_WARNING}</p>
    </div>
  );
}
