import StudentIcon from '../icons/StudentIcons';
import StudentTestCard from './StudentTestCard.jsx';
import StudentTestSectionHeader from './StudentTestSectionHeader.jsx';

function TestGrid({ tests, emptyIcon, emptyTitle, emptyMessage, emptyAction = null }) {
  if (!tests.length) {
    return (
      <div className="student-test-sections__empty" role="status">
        <StudentIcon name={emptyIcon} size={40} className="student-test-sections__empty-icon" />
        <p className="student-test-sections__empty-title">{emptyTitle}</p>
        <p className="student-test-sections__empty-hint">{emptyMessage}</p>
        {emptyAction}
      </div>
    );
  }
  return (
    <div className="student-test-sections__grid">
      {tests.map((test, index) => (
        <StudentTestCard key={test.id} test={test} index={index} />
      ))}
    </div>
  );
}

function availableEmptyCopy({ hasActiveFilters, totalCount, onClearFilters }) {
  if (hasActiveFilters) {
    return {
      title: 'No matching tests',
      message: 'No matching tests — try clearing your filters.',
      action: onClearFilters ? (
        <button type="button" className="student-test-sections__empty-cta" onClick={onClearFilters}>
          Clear filters
        </button>
      ) : null,
    };
  }

  if (totalCount === 0) {
    return {
      title: 'No new tests right now',
      message: 'No tests have been published yet.',
      action: null,
    };
  }

  return {
    title: 'No new tests right now',
    message: 'Check back later for newly published practice tests.',
    action: null,
  };
}

export default function StudentTestSections({
  available,
  completed,
  showGrouped,
  hasActiveFilters = false,
  totalCount = 0,
  onClearFilters,
}) {
  if (!showGrouped) {
    const empty = hasActiveFilters
      ? {
          title: 'No matching tests',
          message: 'No matching tests — try clearing your filters.',
          action: onClearFilters ? (
            <button type="button" className="student-test-sections__empty-cta" onClick={onClearFilters}>
              Clear filters
            </button>
          ) : null,
        }
      : {
          title: 'No matching tests',
          message: 'No tests match your filters.',
          action: null,
        };

    return (
      <div className="student-test-sections">
        <TestGrid
          tests={[...available, ...completed]}
          emptyIcon="clipboard-list"
          emptyTitle={empty.title}
          emptyMessage={empty.message}
          emptyAction={empty.action}
        />
      </div>
    );
  }

  const availableEmpty = availableEmptyCopy({ hasActiveFilters, totalCount, onClearFilters });

  return (
    <div className="student-test-sections">
      <section className="student-test-sections__block" aria-labelledby="tests-available-heading">
        <StudentTestSectionHeader
          id="tests-available-heading"
          title="Available to take"
          count={available.length}
          subtitle="New tests you have not finished yet, including any in-progress attempts."
        />
        <TestGrid
          tests={available}
          emptyIcon="clipboard-list"
          emptyTitle={availableEmpty.title}
          emptyMessage={availableEmpty.message}
          emptyAction={availableEmpty.action}
        />
      </section>

      <section className="student-test-sections__block" aria-labelledby="tests-completed-heading">
        <StudentTestSectionHeader
          id="tests-completed-heading"
          title="Completed"
          count={completed.length}
          subtitle="Tests you have already submitted. View detailed scores in Results."
        />
        <TestGrid
          tests={completed}
          emptyIcon="check-circle"
          emptyTitle="No completed tests yet"
          emptyMessage="Start a practice test above."
        />
      </section>
    </div>
  );
}
