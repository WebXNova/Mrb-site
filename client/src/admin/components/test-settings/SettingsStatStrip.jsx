/**
 * Compact one-row summary: tiny label, large value, optional icon.
 */
export default function SettingsStatStrip({ items = [] }) {
  return (
    <section className="ts-stats" aria-label="Test summary">
      {items.map((item) => (
        <div key={item.label} className="ts-stats__item">
          {item.icon ? <span className="ts-stats__icon">{item.icon}</span> : null}
          <div className="ts-stats__text">
            <p className={`ts-stats__value${item.tone ? ` ts-stats__value--${item.tone}` : ''}`}>
              {item.value}
            </p>
            <p className="ts-stats__label">{item.label}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
