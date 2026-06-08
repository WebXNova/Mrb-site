export default function TestInstructionsSkeleton() {
  return (
    <div className="ti-page" aria-busy="true" aria-label="Loading test instructions">
      <div className="ti-header">
        <div className="ti-skeleton ti-skeleton--eyebrow" />
        <div className="ti-skeleton ti-skeleton--title" />
        <div className="ti-skeleton ti-skeleton--subtitle" />
      </div>

      <div className="ti-grid">
        <div className="ti-card">
          <div className="ti-skeleton ti-skeleton--label" />
          <div className="ti-skeleton ti-skeleton--value" />
        </div>
        <div className="ti-card">
          <div className="ti-skeleton ti-skeleton--label" />
          <div className="ti-skeleton ti-skeleton--value" />
        </div>
        <div className="ti-card">
          <div className="ti-skeleton ti-skeleton--label" />
          <div className="ti-skeleton ti-skeleton--value" />
        </div>
        <div className="ti-card">
          <div className="ti-skeleton ti-skeleton--label" />
          <div className="ti-skeleton ti-skeleton--value" />
        </div>
      </div>

      <div className="ti-card ti-card--wide">
        <div className="ti-skeleton ti-skeleton--label" />
        <div className="ti-skeleton ti-skeleton--line" />
        <div className="ti-skeleton ti-skeleton--line" />
        <div className="ti-skeleton ti-skeleton--line ti-skeleton--short" />
      </div>

      <div className="ti-card ti-card--wide">
        <div className="ti-skeleton ti-skeleton--label" />
        <div className="ti-skeleton ti-skeleton--line" />
        <div className="ti-skeleton ti-skeleton--line" />
        <div className="ti-skeleton ti-skeleton--line" />
      </div>

      <div className="ti-skeleton ti-skeleton--button" />
    </div>
  );
}
