export default function HistoryStatsCards({ statistics }) {
  if (!statistics) return null;

  const cards = [
    { id: 'total', label: 'Total tests', value: statistics.totalTests },
    { id: 'passed', label: 'Passed', value: statistics.passedTests, variant: 'pass' },
    { id: 'failed', label: 'Failed', value: statistics.failedTests, variant: 'fail' },
    {
      id: 'average',
      label: 'Average percentage',
      value:
        statistics.averagePercentage == null ? '—' : `${statistics.averagePercentage}%`,
    },
  ];

  return (
    <section className="th-stats" aria-labelledby="th-stats-heading">
      <h2 id="th-stats-heading" className="visually-hidden">
        Results statistics
      </h2>
      <div className="th-stats__grid">
        {cards.map((card) => (
          <article
            key={card.id}
            className={`th-stats__card ${card.variant ? `th-stats__card--${card.variant}` : ''}`.trim()}
          >
            <p className="th-stats__label">{card.label}</p>
            <p className="th-stats__value">{card.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
