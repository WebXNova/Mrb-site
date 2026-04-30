import { useState } from 'react';
import { http } from '../../api/http';

const initialSettings = {
  platformTitle: 'MRB Learning',
  supportEmail: 'support@mrb.com',
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
      setHealthText(response?.message || 'Server healthy');
    } catch (err) {
      setHealthText(err.message || 'Unable to reach backend');
    }
  }

  return (
    <section className="admin-page">
      <section className="admin-card">
        <h2 className="heading-3">Platform Settings</h2>
        <form className="admin-page" style={{ marginTop: '1rem' }} onSubmit={saveSettings}>
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
          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input
              type="checkbox"
              name="allowTeacherSignups"
              checked={settings.allowTeacherSignups}
              onChange={onChange}
            />
            Allow teacher self-signups
          </label>
          <label className="admin-field" style={{ display: 'flex', flexDirection: 'row', gap: '0.5rem' }}>
            <input
              type="checkbox"
              name="maintenanceMode"
              checked={settings.maintenanceMode}
              onChange={onChange}
            />
            Maintenance mode
          </label>
          <div className="admin-actions">
            <button className="btn btn--primary" type="submit">
              Save Settings
            </button>
            <button className="btn btn--secondary" type="button" onClick={checkApiHealth}>
              Check API Health
            </button>
          </div>
          {statusText ? <p className="admin-success">{statusText}</p> : null}
          {healthText ? <p className="body-sm">{healthText}</p> : null}
        </form>
      </section>

      <section className="admin-card">
        <h2 className="heading-3">Integrations</h2>
        <p className="body-md" style={{ marginTop: '0.75rem' }}>
          Webhooks, SMTP, and audit retention controls are the next backend settings module.
        </p>
      </section>
    </section>
  );
}
