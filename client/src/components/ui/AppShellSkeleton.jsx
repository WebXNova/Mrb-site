import './app-shell-skeleton.css';

export default function AppShellSkeleton({ label = 'Loading page' }) {
  return (
    <div className="app-shell-skeleton" aria-busy="true" aria-label={label}>
      <header className="app-shell-skeleton__nav" aria-hidden="true">
        <div className="app-shell-skeleton__nav-inner">
          <div className="app-skeleton app-skeleton--logo" />
          <div className="app-shell-skeleton__nav-links">
            <div className="app-skeleton app-skeleton--nav-link" />
            <div className="app-skeleton app-skeleton--nav-link" />
            <div className="app-skeleton app-skeleton--nav-link" />
            <div className="app-skeleton app-skeleton--nav-link" />
          </div>
          <div className="app-skeleton app-skeleton--nav-action" />
        </div>
      </header>

      <main className="app-shell-skeleton__main">
        <div className="section">
          <div className="container container-narrow app-shell-skeleton__content">
            <div className="app-skeleton app-skeleton--eyebrow" />
            <div className="app-skeleton app-skeleton--title" />
            <div className="app-skeleton app-skeleton--line" />
            <div className="app-skeleton app-skeleton--line" />
            <div className="app-skeleton app-skeleton--line-short" />
            <div className="app-skeleton app-skeleton--card" />
          </div>
        </div>
      </main>

      <footer className="app-shell-skeleton__footer" aria-hidden="true">
        <div className="app-shell-skeleton__footer-inner">
          <div className="app-skeleton app-skeleton--footer-line" />
          <div className="app-skeleton app-skeleton--footer-line" />
        </div>
      </footer>
    </div>
  );
}
