import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import AdminTestResultsAnalyticsPanel from '../components/AdminTestResultsAnalyticsPanel';
import AdminTestResultsAttemptsTable from '../components/AdminTestResultsAttemptsTable';
import DownloadResultsButton from '../components/DownloadResultsButton';
import TestResultsReleasePanel from '../components/TestResultsReleasePanel';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';

export default function AdminTestResultsPage() {
  const { testId } = useOutletContext();
  const token = getAdminToken();
  const [resultsReleasedAt, setResultsReleasedAt] = useState(null);
  const [settingsError, setSettingsError] = useState('');

  const loadReleaseStatus = useCallback(async () => {
    if (!testId) return;
    setSettingsError('');
    try {
      const response = await adminApi.getTestSettings(token, testId);
      setResultsReleasedAt(response?.data?.results_released_at ?? null);
    } catch (err) {
      setSettingsError(err.message || 'Failed to load release status.');
    }
  }, [testId, token]);

  useEffect(() => {
    loadReleaseStatus();
  }, [loadReleaseStatus]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
        <h2 className="heading-4" style={{ margin: 0, flex: '1 1 auto' }}>
          Results
        </h2>
        {testId ? <DownloadResultsButton testId={testId} /> : null}
      </div>

      <p className="admin-field__hint" style={{ marginBottom: 'var(--space-6)' }}>
        View student attempts, export results, and release scores when ready.
      </p>

      {settingsError ? <p className="admin-error">{settingsError}</p> : null}

      {testId ? (
        <TestResultsReleasePanel
          testId={testId}
          resultsReleasedAt={resultsReleasedAt}
          onChanged={setResultsReleasedAt}
        />
      ) : null}

      {testId ? (
        <>
          <AdminTestResultsAnalyticsPanel testId={testId} />
          <AdminTestResultsAttemptsTable testId={testId} />
        </>
      ) : null}
    </div>
  );
}
