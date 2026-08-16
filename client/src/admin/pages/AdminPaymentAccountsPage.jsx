import { useCallback, useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import PowerSettingsNewOutlinedIcon from '@mui/icons-material/PowerSettingsNewOutlined';
import { adminApi } from '../../api/adminApi';
import { getAdminToken } from '../../auth/session';
import AdminLoadingButton from '../components/AdminLoadingButton';
import { useAdminToast } from '../context/AdminToastContext';
import {
  formatAuditActionLabel,
  formatPaymentMethodLabel,
  normalizePakistaniMobileAccountNumber,
  validateAccountTitleClient,
  validatePaymentAccountNumberClient,
} from '../utils/paymentAccountValidation';
import {
  getPaymentMethodLabel,
  getPaymentMethodLogoSrc,
  PAYMENT_METHODS,
} from '../utils/paymentMethodAssets';
import '../styles/admin-payment-accounts.css';

const EMPTY_FORM = {
  method: 'jazzcash',
  accountNumber: '',
  accountTitle: '',
};

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

function MethodLogo({ method, size = 'md', className = '' }) {
  const src = getPaymentMethodLogoSrc(method);
  const label = getPaymentMethodLabel(method);
  return (
    <span className={`admin-payment-accounts__logo admin-payment-accounts__logo--${size} ${className}`.trim()}>
      <img src={src} alt={label} loading="lazy" />
    </span>
  );
}

function MethodPicker({ value, onChange, disabled = false }) {
  return (
    <div className="admin-payment-accounts__method-picker" role="radiogroup" aria-label="Payment method">
      {PAYMENT_METHODS.map((method) => {
        const selected = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={`admin-payment-accounts__method-option admin-payment-accounts__method-option--${method}${
              selected ? ' is-selected' : ''
            }`}
            onClick={() => onChange(method)}
          >
            <MethodLogo method={method} size="lg" />
            <span>{getPaymentMethodLabel(method)}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function AdminPaymentAccountsPage() {
  const toast = useAdminToast();
  const token = getAdminToken();

  const [loading, setLoading] = useState(true);
  const [canWrite, setCanWrite] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [formMode, setFormMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((row) => Number(row.id) === Number(selectedId)) || null,
    [accounts, selectedId]
  );

  const activeByMethod = useMemo(() => {
    const map = { jazzcash: null, easypaisa: null };
    for (const row of accounts) {
      if (row.isActive) map[row.method] = row;
    }
    return map;
  }, [accounts]);

  const loadAccounts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminApi.paymentAccounts(token);
      setAccounts(res?.data?.accounts ?? []);
      setCanWrite(Boolean(res?.data?.canWrite));
    } catch (err) {
      toast.error(err.message || 'Failed to load payment accounts.');
      setAccounts([]);
      setCanWrite(false);
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const loadAudit = useCallback(
    async (accountId) => {
      if (!token || !accountId) {
        setAuditEntries([]);
        return;
      }
      setAuditLoading(true);
      try {
        const res = await adminApi.paymentAccountAuditLog(token, accountId);
        setAuditEntries(res?.data?.entries ?? []);
      } catch (err) {
        toast.error(err.message || 'Failed to load audit history.');
        setAuditEntries([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    if (selectedId && auditOpen) loadAudit(selectedId);
    else if (!auditOpen) setAuditEntries([]);
  }, [selectedId, auditOpen, loadAudit]);

  function openCreateForm() {
    setFormMode('create');
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function openEditForm(account) {
    setFormMode('edit');
    setForm({
      method: account.method,
      accountNumber: account.accountNumber,
      accountTitle: account.accountTitle,
    });
    setFormError('');
    setSelectedId(account.id);
  }

  function closeForm() {
    setFormMode(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  function openAuditPanel(account) {
    setSelectedId(account.id);
    setAuditOpen(true);
  }

  function closeAuditPanel() {
    setAuditOpen(false);
  }

  function validateForm() {
    const numberError = validatePaymentAccountNumberClient(form.accountNumber, form.method);
    if (numberError) return numberError;
    const titleError = validateAccountTitleClient(form.accountTitle);
    if (titleError) return titleError;
    return '';
  }

  async function handleSaveForm(event) {
    event.preventDefault();
    if (!canWrite || !token) return;

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const payload = {
        method: form.method,
        account_number: normalizePakistaniMobileAccountNumber(form.accountNumber),
        account_title: form.accountTitle.trim(),
      };

      if (formMode === 'create') {
        const res = await adminApi.createPaymentAccount(token, payload);
        const created = res?.data?.account;
        toast.success('Account created.');
        closeForm();
        await loadAccounts();
        if (created?.id) {
          setSelectedId(created.id);
          setAuditOpen(true);
        }
      } else if (formMode === 'edit' && selectedAccount) {
        await adminApi.updatePaymentAccount(token, selectedAccount.id, {
          account_number: payload.account_number,
          account_title: payload.account_title,
        });
        toast.success('Account updated.');
        closeForm();
        await loadAccounts();
        if (auditOpen) await loadAudit(selectedAccount.id);
      }
    } catch (err) {
      const msg = err.message || 'Failed to save account.';
      setFormError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function requestActivate(account) {
    const currentActive = activeByMethod[account.method];
    setConfirmDialog({
      kind: 'activate',
      account,
      title: 'Set as live account?',
      message: currentActive
        ? `Replaces the current live ${formatPaymentMethodLabel(account.method)} account.`
        : `Students will see this number at checkout.`,
    });
  }

  function requestDeactivate(account) {
    setConfirmDialog({
      kind: 'deactivate',
      account,
      title: 'Deactivate account?',
      message: 'This number will no longer be shown to students.',
    });
  }

  async function applyConfirmAction() {
    if (!confirmDialog || !token || !canWrite) return;
    const { account, kind } = confirmDialog;
    setBusyId(account.id);
    try {
      if (kind === 'activate') {
        await adminApi.activatePaymentAccount(token, account.id);
        toast.success('Account activated.');
      } else {
        await adminApi.deactivatePaymentAccount(token, account.id);
        toast.success('Account deactivated.');
      }
      setConfirmDialog(null);
      await loadAccounts();
      if (auditOpen && Number(selectedId) === Number(account.id)) {
        await loadAudit(account.id);
      }
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-page admin-page--payment-accounts">
      <header className="admin-payment-accounts__hero">
        <div>
          <h2 className="heading-3 admin-payment-accounts__title">Payment Accounts</h2>
          <p className="admin-payment-accounts__subtitle">Live receiving numbers for manual checkout</p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn--primary admin-payment-accounts__add-btn" onClick={openCreateForm}>
            <AddIcon fontSize="small" aria-hidden />
            Add account
          </button>
        ) : (
          <span className="admin-payment-accounts__role-badge">View only</span>
        )}
      </header>

      {!canWrite ? (
        <p className="admin-payment-accounts__readonly-banner" role="status">
          Read-only — contact a super admin to make changes.
        </p>
      ) : null}

      <div className="admin-payment-accounts__summary">
        {PAYMENT_METHODS.map((method) => {
          const active = activeByMethod[method];
          return (
            <article
              key={method}
              className={`admin-payment-accounts__summary-card admin-payment-accounts__summary-card--${method}${
                active ? ' is-live' : ''
              }`}
            >
              <div className="admin-payment-accounts__summary-top">
                <MethodLogo method={method} size="lg" />
                <span
                  className={`admin-payment-accounts__pill ${
                    active ? 'admin-payment-accounts__pill--live' : 'admin-payment-accounts__pill--idle'
                  }`}
                >
                  {active ? 'Live' : 'Not set'}
                </span>
              </div>
              {active ? (
                <div className="admin-payment-accounts__summary-body">
                  <p className="admin-payment-accounts__summary-number">{active.accountNumber}</p>
                  <p className="admin-payment-accounts__summary-title">{active.accountTitle}</p>
                </div>
              ) : (
                <p className="admin-payment-accounts__summary-empty">No live account</p>
              )}
            </article>
          );
        })}
      </div>

      <section className="admin-card admin-payment-accounts__main">
        <div className="admin-payment-accounts__table-toolbar">
          <h3 className="heading-4">Accounts</h3>
          {!loading ? <span className="admin-payment-accounts__count">{accounts.length}</span> : null}
        </div>

        {loading ? (
          <div className="admin-payment-accounts__loading">
            <span className="admin-spinner admin-spinner--sm" aria-hidden />
            Loading…
          </div>
        ) : accounts.length ? (
          <div className="admin-payment-accounts__layout">
            <div className="admin-payment-accounts__table-wrap">
              <table className="admin-table admin-payment-accounts__table">
                <thead>
                  <tr>
                    <th>Method</th>
                    <th>Number</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        Number(selectedId) === Number(row.id) && auditOpen ? 'is-selected' : undefined
                      }
                    >
                      <td>
                        <MethodLogo method={row.method} size="sm" />
                      </td>
                      <td>
                        <code className="admin-payment-accounts__number">{row.accountNumber}</code>
                      </td>
                      <td className="admin-payment-accounts__title-cell">{row.accountTitle}</td>
                      <td>
                        <span
                          className={`admin-payment-accounts__pill ${
                            row.isActive
                              ? 'admin-payment-accounts__pill--live'
                              : 'admin-payment-accounts__pill--idle'
                          }`}
                        >
                          {row.isActive ? 'Live' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <span className="admin-payment-accounts__updated" title={formatWhen(row.updatedAt)}>
                          {row.updatedByName || '—'}
                          <small>{formatWhen(row.updatedAt)}</small>
                        </span>
                      </td>
                      <td>
                        <div className="admin-payment-accounts__actions">
                          <button
                            type="button"
                            className="admin-payment-accounts__icon-btn"
                            title="History"
                            aria-label={`History for ${row.accountTitle}`}
                            onClick={() => openAuditPanel(row)}
                          >
                            <HistoryOutlinedIcon fontSize="small" />
                          </button>
                          {canWrite ? (
                            <>
                              <button
                                type="button"
                                className="admin-payment-accounts__icon-btn"
                                title="Edit"
                                aria-label={`Edit ${row.accountTitle}`}
                                onClick={() => openEditForm(row)}
                              >
                                <EditOutlinedIcon fontSize="small" />
                              </button>
                              {!row.isActive ? (
                                <button
                                  type="button"
                                  className="admin-payment-accounts__icon-btn admin-payment-accounts__icon-btn--primary"
                                  title="Activate"
                                  aria-label={`Activate ${row.accountTitle}`}
                                  disabled={busyId === row.id}
                                  onClick={() => requestActivate(row)}
                                >
                                  <PowerSettingsNewOutlinedIcon fontSize="small" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="admin-payment-accounts__icon-btn admin-payment-accounts__icon-btn--danger"
                                  title="Deactivate"
                                  aria-label={`Deactivate ${row.accountTitle}`}
                                  disabled={busyId === row.id}
                                  onClick={() => requestDeactivate(row)}
                                >
                                  <PowerSettingsNewOutlinedIcon fontSize="small" />
                                </button>
                              )}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {auditOpen && selectedAccount ? (
              <aside className="admin-payment-accounts__audit-panel" aria-label="Audit history">
                <header className="admin-payment-accounts__audit-panel-head">
                  <div className="admin-payment-accounts__audit-panel-title">
                    <MethodLogo method={selectedAccount.method} size="sm" />
                    <div>
                      <h4 className="heading-4">History</h4>
                      <p className="admin-payment-accounts__audit-sub">
                        {selectedAccount.accountNumber}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="admin-payment-accounts__icon-btn"
                    aria-label="Close history"
                    onClick={closeAuditPanel}
                  >
                    <CloseIcon fontSize="small" />
                  </button>
                </header>
                {auditLoading ? (
                  <p className="admin-muted">Loading…</p>
                ) : auditEntries.length ? (
                  <ol className="admin-payment-accounts__audit-list">
                    {auditEntries.map((entry) => (
                      <li key={entry.id} className="admin-payment-accounts__audit-item">
                        <div className="admin-payment-accounts__audit-item-head">
                          <span
                            className={`admin-payment-accounts__audit-action admin-payment-accounts__audit-action--${entry.action}`}
                          >
                            {formatAuditActionLabel(entry.action)}
                          </span>
                          <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
                        </div>
                        <p className="admin-payment-accounts__audit-meta">
                          {entry.changedByName || entry.changedByEmail || `#${entry.changedBy}`}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="admin-muted">No history yet.</p>
                )}
              </aside>
            ) : null}
          </div>
        ) : (
          <div className="admin-payment-accounts__empty">
            <div className="admin-payment-accounts__empty-logos">
              {PAYMENT_METHODS.map((method) => (
                <MethodLogo key={method} method={method} size="lg" />
              ))}
            </div>
            <p className="heading-4">No accounts yet</p>
            {canWrite ? (
              <button type="button" className="btn btn--primary admin-payment-accounts__add-btn" onClick={openCreateForm}>
                <AddIcon fontSize="small" aria-hidden />
                Add account
              </button>
            ) : null}
          </div>
        )}
      </section>

      {formMode ? (
        <div className="admin-payment-accounts__modal-backdrop" role="presentation" onClick={closeForm}>
          <div
            className="admin-payment-accounts__modal admin-payment-accounts__modal--form"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pa-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="admin-payment-accounts__modal-head">
              <h3 id="pa-form-title" className="heading-4">
                {formMode === 'create' ? 'New account' : 'Edit account'}
              </h3>
              <button type="button" className="admin-payment-accounts__icon-btn" aria-label="Close" onClick={closeForm}>
                <CloseIcon fontSize="small" />
              </button>
            </header>

            <form className="admin-payment-accounts__form" onSubmit={handleSaveForm}>
              {formMode === 'create' ? (
                <div className="admin-field">
                  <span className="admin-payment-accounts__field-label">Method</span>
                  <MethodPicker
                    value={form.method}
                    onChange={(method) => setForm((prev) => ({ ...prev, method }))}
                  />
                </div>
              ) : (
                <div className="admin-field admin-payment-accounts__method-readonly">
                  <span className="admin-payment-accounts__field-label">Method</span>
                  <MethodLogo method={form.method} size="md" />
                </div>
              )}

              <div className="admin-field">
                <label htmlFor="pa-number">Mobile number</label>
                <input
                  id="pa-number"
                  value={form.accountNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  placeholder="03XXXXXXXXX"
                  autoComplete="off"
                  inputMode="tel"
                />
              </div>

              <div className="admin-field">
                <label htmlFor="pa-title">Label</label>
                <input
                  id="pa-title"
                  value={form.accountTitle}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountTitle: e.target.value }))}
                  placeholder="Main wallet"
                  maxLength={120}
                />
              </div>

              {formError ? (
                <p className="admin-error" role="alert">
                  {formError}
                </p>
              ) : null}

              <div className="admin-payment-accounts__modal-actions">
                <button type="button" className="btn btn--secondary" onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <AdminLoadingButton type="submit" isLoading={saving} loadingLabel="Saving…">
                  {formMode === 'create' ? 'Create' : 'Save'}
                </AdminLoadingButton>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="admin-payment-accounts__modal-backdrop" role="presentation">
          <div className="admin-payment-accounts__modal" role="dialog" aria-modal="true" aria-labelledby="pa-confirm-title">
            <div className="admin-payment-accounts__confirm-brand">
              <MethodLogo method={confirmDialog.account.method} size="md" />
            </div>
            <h3 id="pa-confirm-title" className="heading-4">
              {confirmDialog.title}
            </h3>
            <p className="admin-payment-accounts__confirm-msg">{confirmDialog.message}</p>
            <div className="admin-payment-accounts__modal-actions">
              <button type="button" className="btn btn--secondary" onClick={() => setConfirmDialog(null)}>
                Cancel
              </button>
              <AdminLoadingButton
                className={`btn ${confirmDialog.kind === 'deactivate' ? 'btn--danger' : 'btn--primary'}`}
                isLoading={busyId === confirmDialog.account.id}
                loadingLabel="…"
                onClick={applyConfirmAction}
              >
                {confirmDialog.kind === 'deactivate' ? 'Deactivate' : 'Activate'}
              </AdminLoadingButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
