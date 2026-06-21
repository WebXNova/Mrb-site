const TABS = [
  { id: 'general', label: 'General' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'batch', label: 'Batch & rules' },
  { id: 'health', label: 'Health' },
];

export default function CourseDetailsNav({ activeTab, onTabChange, issueCounts = {} }) {
  return (
    <nav className="course-details-nav" aria-label="Course sections">
      <ul className="course-details-nav__list">
        {TABS.map((tab) => {
          const issues = issueCounts[tab.id] || 0;
          return (
            <li key={tab.id}>
              <button
                type="button"
                className={`course-details-nav__tab${activeTab === tab.id ? ' course-details-nav__tab--active' : ''}`}
                onClick={() => onTabChange(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
              >
                {tab.label}
                {issues > 0 ? (
                  <span className="course-details-nav__badge" aria-label={`${issues} issue(s)`}>
                    {issues}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
