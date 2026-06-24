import { useCallback, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

export default function DownloadResultsButton({ testId }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const doDownload = useCallback(async (format) => {
    setDownloading(format);
    setOpen(false);
    try {
      const token = getAdminToken();
      const { blob, filename } = await adminApi.exportTestResults(token, testId, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `test-results.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // download failure handled silently
    } finally {
      setDownloading(null);
    }
  }, [testId]);

  const label = downloading === 'xlsx' ? 'Downloading XLSX…'
    : downloading === 'csv' ? 'Downloading CSV…'
    : '\uD83D\uDCE5 Download Results';

  return (
    <div className="dropdown-btn-wrapper">
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={downloading != null}
        aria-haspopup="true"
        aria-expanded={open}
      >
        {downloading != null ? <span className="admin-spinner admin-spinner--sm" /> : null}
        {label}
      </button>
      {open ? (
        <>
          <div className="dropdown-backdrop" onClick={() => setOpen(false)} />
          <ul className="dropdown-menu" role="menu">
            <li role="menuitem">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => doDownload('xlsx')}
                disabled={downloading != null}
              >
                Excel (.xlsx)
              </button>
            </li>
            <li role="menuitem">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => doDownload('csv')}
                disabled={downloading != null}
              >
                CSV (.csv)
              </button>
            </li>
          </ul>
        </>
      ) : null}
    </div>
  );
}
