import {
  formatDuration,
  formatNegativeMarking,
  formatPassingPercentage,
} from '../utils/formatters';

function MetaItem({ icon, label, value, id }) {
  return (
    <article className="ti-card" aria-labelledby={id}>
      <div className="ti-card__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="ti-card__label" id={id}>
        {label}
      </p>
      <p className="ti-card__value">{value}</p>
    </article>
  );
}

export default function TestMetaGrid({ meta }) {
  if (!meta) return null;

  return (
    <section className="ti-grid" aria-label="Test overview">
      <MetaItem
        id="ti-meta-questions"
        icon="?"
        label="Questions"
        value={String(meta.questionCount ?? 0)}
      />
      <MetaItem
        id="ti-meta-duration"
        icon="⏱"
        label="Duration"
        value={formatDuration(meta.durationMinutes)}
      />
      <MetaItem
        id="ti-meta-passing"
        icon="✓"
        label="Passing score"
        value={formatPassingPercentage(meta.passingPercentage)}
      />
      <MetaItem
        id="ti-meta-marking"
        icon="±"
        label="Negative marking"
        value={formatNegativeMarking(meta.negativeMarkingEnabled, meta.negativeMarking)}
      />
    </section>
  );
}
