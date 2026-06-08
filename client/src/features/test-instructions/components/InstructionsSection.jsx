export default function InstructionsSection({ meta }) {
  const custom = meta?.customInstructions || meta?.description || null;
  const standard = Array.isArray(meta?.standardInstructions) ? meta.standardInstructions : [];

  if (!custom && standard.length === 0) {
    return null;
  }

  return (
    <section className="ti-card ti-card--wide ti-instructions" aria-labelledby="ti-instructions-heading">
      <h2 className="ti-section-title" id="ti-instructions-heading">
        Instructions
      </h2>

      {custom ? (
        <div className="ti-instructions__custom">
          <h3 className="ti-instructions__subtitle">From your instructor</h3>
          <p className="ti-instructions__text">{custom}</p>
        </div>
      ) : null}

      {standard.length > 0 ? (
        <div className="ti-instructions__standard">
          {custom ? <h3 className="ti-instructions__subtitle">General guidelines</h3> : null}
          <ul className="ti-instructions__list">
            {standard.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
