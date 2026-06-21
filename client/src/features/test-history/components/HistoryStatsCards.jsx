function resolveCardTheme(hasBlueElement) {
  return hasBlueElement ? 'th-stats__card th-stats__card--dark' : 'th-stats__card';
}

export default function HistoryStatsCards({ statistics }) {
  if (!statistics) return null;

  const cards = [
    { id: 'total', label: 'Total tests', value: statistics.totalTests, hasBlueElement: true },
    {
      id: 'passed',
      label: 'Passed',
      value: statistics.passedTests,
      valueClass: 'th-stats__value--pass',
    },
    {
      id: 'failed',
      label: 'Failed',
      value: statistics.failedTests,
      valueClass: 'th-stats__value--fail',
    },
    {
      id: 'average',
      label: 'Average percentage',
      value: statistics.averagePercentage == null ? '—' : `${statistics.averagePercentage}%`,
      hasBlueElement: true,
    },
  ];

  return (
    <section className="th-stats" aria-labelledby="th-stats-heading">
      <h2 id="th-stats-heading" className="visually-hidden">
        Results statistics
      </h2>
      <div className="th-stats__grid">
        {cards.map((card) => (
          <article key={card.id} className={resolveCardTheme(Boolean(card.hasBlueElement))}>
            <p className="th-stats__label">{card.label}</p>
            <p className={`th-stats__value ${card.valueClass ?? ''}`.trim()}>{card.value}</p>
            <div className="th-stats__accent" aria-hidden="true" />
          </article>
        ))}
      </div>
    </section>
  );
}
