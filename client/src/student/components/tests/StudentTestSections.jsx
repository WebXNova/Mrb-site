import StudentTestCard from './StudentTestCard.jsx';

function TestGrid({ tests, emptyMessage }) {
  if (!tests.length) {
    return <p className="student-test-sections__empty">{emptyMessage}</p>;
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
    return <TestGrid tests={all} emptyMessage="No tests match your filters." />;
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
          emptyMessage="No new tests right now. Check back later or clear your filters."
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
          emptyMessage="No completed tests yet. Start a practice test above."
        />
      </section>
    </div>
  );
}
