import { useLayoutEffect } from 'react';
import { syncStudentThemeDocument } from '../utils/studentThemeStorage';
import '../styles/student-portal-skeleton.css';

export default function StudentPortalSkeleton({ label = 'Loading student portal' }) {
  useLayoutEffect(() => {
    syncStudentThemeDocument();
  }, []);

  return (
    <div className="sp-portal-skeleton" aria-busy="true" aria-label={label}>
      <aside className="sp-portal-skeleton__sidebar" aria-hidden="true">
        <div className="sp-portal-skeleton__block sp-portal-skeleton__block--brand" />
        <div className="sp-portal-skeleton__block sp-portal-skeleton__block--nav" />
        <div className="sp-portal-skeleton__block sp-portal-skeleton__block--nav" />
        <div className="sp-portal-skeleton__block sp-portal-skeleton__block--nav" />
        <div className="sp-portal-skeleton__block sp-portal-skeleton__block--nav" />
      </aside>

      <div className="sp-portal-skeleton__main">
        <header className="sp-portal-skeleton__header" aria-hidden="true">
          <div className="sp-portal-skeleton__block sp-portal-skeleton__block--header" />
          <div className="sp-portal-skeleton__block sp-portal-skeleton__block--header" />
          <div className="sp-portal-skeleton__block sp-portal-skeleton__block--header" />
        </header>

        <main className="sp-portal-skeleton__content">
          <div className="sp-portal-skeleton__block sp-portal-skeleton__block--hero" />
          <div className="sp-portal-skeleton__stats">
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--stat" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--stat" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--stat" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--stat" />
          </div>
          <div className="sp-portal-skeleton__block sp-portal-skeleton__block--hero" style={{ height: '280px', marginBottom: '1rem' }} />
          <div className="sp-portal-skeleton__grid">
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--panel" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--panel" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--panel" />
          </div>
          <div className="sp-portal-skeleton__grid sp-portal-skeleton__grid--2">
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--panel" />
            <div className="sp-portal-skeleton__block sp-portal-skeleton__block--panel" />
          </div>
        </main>
      </div>
    </div>
  );
}
