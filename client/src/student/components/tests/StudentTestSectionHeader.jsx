export default function StudentTestSectionHeader({
  id,
  title,
  count,
  subtitle,
  action = null,
  variant = 'section',
}) {
  const showCount = Number.isFinite(Number(count));

  return (
    <header className={`student-test-heading student-test-heading--${variant}`}>
      <div className="student-test-heading__row">
        <h2 id={id} className="student-test-heading__title">
          <span className="student-test-heading__label">{title}</span>
          {showCount ? (
            <span className="student-test-heading__count" aria-label={`${count} tests`}>
              {count}
            </span>
          ) : null}
        </h2>
        {action}
      </div>
      {subtitle ? <p className="student-test-heading__sub">{subtitle}</p> : null}
    </header>
  );
}
