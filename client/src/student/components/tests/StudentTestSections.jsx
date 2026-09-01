import StudentIcon from '../icons/StudentIcons';
import StudentTestCard from './StudentTestCard.jsx';

function TestGrid({ tests, emptyTitle, emptyMessage }) {
  if (!tests.length) {
    return (
      <div className="student-test-sections__empty" role="status">
        <StudentIcon name="clipboard-check" size={28} className="student-test-sections__empty-icon" />
        <p className="student-test-sections__empty-title">{emptyTitle}</p>
        <p className="student-test-sections__empty-hint">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="student-test-sections__grid">
      {tests.map((test) => (
        <StudentTestCard key={test.id} test={test} />
      ))}
    </div>
  );
}

export default function StudentTestSections({ available, completed, showGrouped }) {
  if (!showGrouped) {
    const all = [...available, ...completed];
    return (
      <TestGrid
        tests={all}
        emptyTitle="No matching tests"
        emptyMessage="No tests match your filters."
      />
    );
  }

  return (
    <div className="student-test-sections">
      <section className="student-test-sections__block" aria-labelledby="tests-available-heading">
        <header className="student-test-sections__header">
          <h2 id="tests-available-heading" className="student-test-sections__title">
            Available to take
          </h2>
          <p className="student-test-sections__subtitle">
            New tests you have not finished yet, including any in-progress attempts.
          </p>
        </header>
        <TestGrid
          tests={available}
          emptyTitle="No new tests right now"
          emptyMessage="Check back later or clear your filters."
        />
      </section>

      <section className="student-test-sections__block" aria-labelledby="tests-completed-heading">
        <header className="student-test-sections__header">
          <h2 id="tests-completed-heading" className="student-test-sections__title">
            Completed
          </h2>
          <p className="student-test-sections__subtitle">
            Tests you have already submitted. View detailed scores in Results.
          </p>
        </header>
        <TestGrid
          tests={completed}
          emptyTitle="No completed tests yet"
          emptyMessage="Start a practice test above."
        />
      </section>
    </div>
  );
}
