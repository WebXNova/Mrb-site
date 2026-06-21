export default function RibbonGroup({ label, children }) {
  return (
    <div className="qaw-ribbon-group" role="group" aria-label={label}>
      <span className="qaw-ribbon-group__label">{label}</span>
      <div className="qaw-ribbon-group__items">{children}</div>
    </div>
  );
}
