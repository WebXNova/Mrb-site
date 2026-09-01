export default function ResultPolicySection({ meta }) {
  if (!meta) return null;

  const immediate = meta.showResultImmediately !== false;
  const answers = Boolean(meta.showAnswersAfterSubmit);
  const explanations = Boolean(meta.showExplanations);

  return (
    <section className="ti-card ti-card--wide" aria-labelledby="ti-result-policy-heading">
      <h2 className="ti-section-title" id="ti-result-policy-heading">
        Results and review
      </h2>
      <ul className="ti-instructions__list">
        <li>
          {immediate
            ? 'Your score is shown after you submit, unless the administrator holds results for review.'
            : 'Results are not shown immediately. Check this page again after your instructor publishes them.'}
        </li>
        <li>
          {answers
            ? 'Detailed answers can be shown after results are released.'
            : 'Correct answers stay hidden unless the administrator enables review.'}
        </li>
        <li>
          {explanations
            ? 'Explanations may appear with detailed review when results are available.'
            : 'Explanations are not shown for this test.'}
        </li>
      </ul>
    </section>
  );
}
