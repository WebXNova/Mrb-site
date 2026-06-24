import { useCallback, useState } from 'react';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

export default function DownloadResultsButton({ testId }) {
  const [downloading, setDownloading] = useState(false);

  const doDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const token = getAdminToken();
      const { blob, filename } = await adminApi.exportTestResults(token, testId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `test-results.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // download failure handled silently
    } finally {
      setDownloading(false);
    }
  }, [testId]);

  return (
    <button
      className="btn btn--ghost btn--sm"
      type="button"
      onClick={doDownload}
      disabled={downloading}
    >
      {downloading ? <span className="admin-spinner admin-spinner--sm" /> : null}
      {downloading ? 'Downloading…' : 'Download Result'}
    </button>
  );
}
