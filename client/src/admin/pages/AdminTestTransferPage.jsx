import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import { safeAdminErrorMessage } from '../../components/admin/adminSafeMessages';
import '../styles/admin-tests.css';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function StatusBadge({ status }) {
  const normalized = String(status ?? '').toUpperCase();
  const cls =
    normalized === 'COMPLETED'
      ? 'admin-test-status-badge admin-test-status-badge--published'
      : normalized === 'FAILED'
        ? 'admin-test-status-badge admin-test-status-badge--draft'
        : 'admin-test-status-badge';
  return <span className={cls}>{normalized || '—'}</span>;
}

function TransferStats({ stats }) {
  if (!stats) return null;
  return (
    <div className="admin-grid" style={{ marginBottom: 'var(--space-4)' }}>
      <article className="admin-stat-card">
        <p className="admin-stat-card__label">Exports</p>
        <p className="admin-stat-card__value">{stats.export_count ?? 0}</p>
      </article>
      <article className="admin-stat-card">
        <p className="admin-stat-card__label">Imports</p>
        <p className="admin-stat-card__value">{stats.import_count ?? 0}</p>
      </article>
      <article className="admin-stat-card">
        <p className="admin-stat-card__label">Failures</p>
        <p className="admin-stat-card__value">{stats.failure_count ?? 0}</p>
      </article>
      <article className="admin-stat-card">
        <p className="admin-stat-card__label">Last activity</p>
        <p className="admin-stat-card__value" style={{ fontSize: '0.875rem' }}>
          {formatDate(stats.last_activity_at)}
        </p>
      </article>
    </div>
  );
}

function ExportHistoryTable({ items }) {
  if (!items?.length) {
    return <p className="admin-test-import-wizard__file-meta">No export history yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Test</th>
            <th>Format</th>
            <th>Questions</th>
            <th>Images</th>
            <th>Duration</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.test_title || `#${row.test_id}`}</td>
              <td>{String(row.format ?? '').toUpperCase()}</td>
              <td>{row.question_count}</td>
              <td>{row.image_count ?? 0}</td>
              <td>{row.processing_time_ms != null ? `${row.processing_time_ms}ms` : '—'}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td>{formatDate(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImportHistoryTable({ items }) {
  if (!items?.length) {
    return <p className="admin-test-import-wizard__file-meta">No import history yet.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Course</th>
            <th>Test</th>
            <th>Format</th>
            <th>Questions</th>
            <th>Validation errors</th>
            <th>Duration</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.course_title || `#${row.target_course_id}`}</td>
              <td>
                {row.target_test_id ? (
                  <Link to={adminRoute(`tests/${row.target_test_id}/setup`)}>
                    {row.test_title || `#${row.target_test_id}`}
                  </Link>
                ) : (
                  '—'
                )}
              </td>
              <td>{String(row.format ?? 'auto').toUpperCase()}</td>
              <td>{row.total_questions}</td>
              <td>{row.validation_error_count ?? 0}</td>
              <td>{row.processing_time_ms != null ? `${row.processing_time_ms}ms` : '—'}</td>
              <td>
                <StatusBadge status={row.status} />
              </td>
              <td>{formatDate(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransferLogsTable({ items }) {
  if (!items?.length) {
    return <p className="admin-test-import-wizard__file-meta">No transfer logs found.</p>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Action</th>
            <th>Entity</th>
            <th>Metadata</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {items.map((log) => (
            <tr key={log.id ?? `${log.action}-${log.created_at}`}>
              <td>{log.action}</td>
              <td>
                {log.entity_type} #{log.entity_id ?? '—'}
              </td>
              <td>
                <code style={{ fontSize: '0.75rem' }}>
                  {log.metadata ? JSON.stringify(log.metadata) : '—'}
                </code>
              </td>
              <td>{formatDate(log.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'exports', label: 'Export history' },
  { key: 'imports', label: 'Import history' },
  { key: 'logs', label: 'Download logs' },
];

export default function AdminTestTransferPage() {
  const token = getAdminToken();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [exportItems, setExportItems] = useState([]);
  const [importItems, setImportItems] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      adminApi.getTestTransferDashboard(token),
      adminApi.getTestTransferLogs(token, { limit: 100 }),
    ])
      .then(([dashRes, logsRes]) => {
        if (cancelled) return;
        const dash = dashRes?.data ?? dashRes;
        setDashboard(dash);
        setExportItems(dash?.recent_exports ?? []);
        setImportItems(dash?.recent_imports ?? []);
        setLogs(logsRes?.data?.items ?? logsRes?.items ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(safeAdminErrorMessage(err, 'Failed to load transfer history.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (tab !== 'exports' && tab !== 'imports') return undefined;

    let cancelled = false;
    const loader =
      tab === 'exports'
        ? adminApi.listTestExportHistory(token, { limit: 200 })
        : adminApi.listTestImportHistory(token, { limit: 200 });

    loader
      .then((res) => {
        if (cancelled) return;
        const items = res?.data?.items ?? res?.items ?? [];
        if (tab === 'exports') setExportItems(items);
        else setImportItems(items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(safeAdminErrorMessage(err, 'Failed to load history.'));
      });

    return () => {
      cancelled = true;
    };
  }, [tab, token]);

  function downloadLogsJson() {
    const payload = {
      exported_at: new Date().toISOString(),
      logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `test-transfer-logs-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="admin-page admin-page--tests">
      <header className="admin-courses-page-header">
        <div>
          <h1 className="admin-courses-page-header__title">Test export / import history</h1>
          <p className="admin-courses-page-header__subtitle">
            Audit trail for test backups and migrations — exports, imports, failures, and processing
            times.
          </p>
        </div>
        <div className="admin-courses-page-header__actions">
          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests/import')}>
            Import test
          </Link>
          <Link className="btn btn--secondary admin-touch-target" to={adminRoute('tests')}>
            Back to tests
          </Link>
        </div>
      </header>

      <nav className="admin-test-import-wizard__steps" aria-label="Transfer history sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`admin-test-import-wizard__step${tab === item.key ? ' admin-test-import-wizard__step--current' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <section className="admin-card" aria-busy="true">
          Loading transfer history…
        </section>
      ) : (
        <section className="admin-card">
          {tab === 'overview' ? (
            <>
              <TransferStats stats={dashboard?.stats} />
              <h2 className="heading-4">Recent exports</h2>
              <ExportHistoryTable items={dashboard?.recent_exports} />
              <h2 className="heading-4" style={{ marginTop: 'var(--space-4)' }}>
                Recent imports
              </h2>
              <ImportHistoryTable items={dashboard?.recent_imports} />
            </>
          ) : null}

          {tab === 'exports' ? <ExportHistoryTable items={exportItems} /> : null}
          {tab === 'imports' ? <ImportHistoryTable items={importItems} /> : null}
          {tab === 'logs' ? (
            <>
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <button type="button" className="btn btn--secondary admin-touch-target" onClick={downloadLogsJson}>
                  Download logs (JSON)
                </button>
              </div>
              <TransferLogsTable items={logs} />
            </>
          ) : null}
        </section>
      )}
    </section>
  );
}
