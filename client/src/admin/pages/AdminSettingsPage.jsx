import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRoute } from '../../config/adminPaths';
import { http } from '../../api/http';
import AdminToggleSwitch from '../components/courses/AdminToggleSwitch';
import SectionCard from '../components/ui/SectionCard';

const initialSettings = {
  platformTitle: 'MRB Classes',
  supportEmail: '',
  maintenanceMode: false,
  allowTeacherSignups: true,
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('admin_panel_settings');
    return saved ? JSON.parse(saved) : initialSettings;
  });
  const [statusText, setStatusText] = useState('');
  const [healthText, setHealthText] = useState('');

  function onChange(event) {
    const { name, type, checked, value } = event.target;
    setSettings((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  function saveSettings(event) {
    event.preventDefault();
    localStorage.setItem('admin_panel_settings', JSON.stringify(settings));
    setStatusText('Settings saved locally for this admin panel.');
  }

  async function checkApiHealth() {
    setHealthText('Checking...');
    try {
      const response = await http.get('/health');
      setHealthText(response?.data?.message || 'Server healthy');
    } catch (err) {
      setHealthText(err.message || 'Unable to reach backend');
    }
  }

  return (
    <section className="admin-page">
      <SectionCard title="Platform Settings" lead="Update core platform values while keeping existing behavior unchanged.">
        <form className="admin-page admin-settings-form" onSubmit={saveSettings}>
          <div className="admin-form-grid">
            <div className="admin-field">
              <label htmlFor="platformTitle">Platform Title</label>
              <input
                id="platformTitle"
                name="platformTitle"
                value={settings.platformTitle}
                onChange={onChange}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="supportEmail">Support Email</label>
              <input
                id="supportEmail"
                name="supportEmail"
                type="email"
                value={settings.supportEmail}
                onChange={onChange}
              />
            </div>
          </div>

          <div className="admin-settings-toggles">
            <AdminToggleSwitch
              id="allowTeacherSignups"
              name="allowTeacherSignups"
              checked={settings.allowTeacherSignups}
              onChange={onChange}
              label="Allow teacher self-signups"
              hint="Let teachers create accounts without manual invite."
            />
            <AdminToggleSwitch
              id="maintenanceMode"
              name="maintenanceMode"
              checked={settings.maintenanceMode}
              onChange={onChange}
              label="Maintenance mode"
              hint="Temporarily pause new activity while maintenance is in progress."
            />
          </div>

          <div className="admin-actions">
            <button className="btn btn--primary" type="submit">
              Save Settings
            </button>
            <button className="btn btn--secondary" type="button" onClick={checkApiHealth}>
              Check API Health
            </button>
          </div>
          {statusText ? <p className="admin-success admin-status-pill">{statusText}</p> : null}
          {healthText ? <p className="body-sm admin-status-pill admin-status-pill--neutral">{healthText}</p> : null}
        </form>
      </SectionCard>

      <SectionCard title="Integrations" lead="Webhooks, SMTP, and audit retention controls are the next backend settings module.">
        <div className="admin-actions">
          <Link className="btn btn--secondary btn--sm" to={adminRoute('settings/course-categories')}>
            Course Categories
          </Link>
          <Link className="btn btn--secondary btn--sm" to={adminRoute('settings/coupons')}>
            Coupons
          </Link>
          <Link className="btn btn--secondary btn--sm" to={adminRoute('settings/payment-accounts')}>
            Payment Accounts
          </Link>
        </div>
      </SectionCard>
    </section>
  );
}
