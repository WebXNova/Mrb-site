import PageLayout from '../components/layout/PageLayout';
import { useState } from 'react';
import SocialMediaLinks from '../components/ui/SocialMediaLinks';
import './ContactPage.css';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [remark, setRemark] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState({ error: '', success: '' });

  async function submitRemark(event) {
    event.preventDefault();
    setSendState({ error: '', success: '' });
    setIsSending(true);
    try {
      const response = await fetch('/api/contact/remarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || null,
          email: null,
          message: remark.trim(),
          pageUrl: '/contact',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || 'Failed to send remark');
      }
      setRemark('');
      setName('');
      setSendState({ error: '', success: 'Remark sent successfully.' });
    } catch (err) {
      setSendState({ error: err.message || 'Failed to send remark', success: '' });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <PageLayout>
      <section className="section">
        <div className="container container-narrow">
          <span className="eyebrow">Contact</span>
          <h1 className="heading-1 text-balance" style={{ marginTop: '1rem' }}>
            We’ll get back to you within a working day.
          </h1>
          <p className="body-lg text-pretty" style={{ marginTop: '1.5rem' }}>
            For MRB-code activation issues, billing, or general queries, write to us
            at{' '}
            <a
              href="mailto:mrbclasses8@gmail.com"
              style={{ color: 'var(--color-primary)', fontWeight: 600 }}
            >
              mrbclasses8@gmail.com
            </a>
            .
          </p>

          <section className="contact-block">
            <h2 className="heading-3">Our Social Accounts</h2>
            <p className="body-md contact-block__text">Tap any icon to open the official MRB account.</p>
            <SocialMediaLinks compact />
          </section>

          <section className="contact-block">
            <h2 className="heading-3">Send a Remark</h2>
            <form className="contact-remark-form" onSubmit={submitRemark}>
              <label className="contact-remark-form__label" htmlFor="remarkName">
                Name (optional)
              </label>
              <input
                id="remarkName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
              <label className="contact-remark-form__label" htmlFor="remarkText">
                Your remark
              </label>
              <textarea
                id="remarkText"
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
                placeholder="Write your feedback or suggestion..."
                required
              />
              <button className="btn btn--primary" type="submit">
                {isSending ? 'Sending...' : 'Send Remark'}
              </button>
              {sendState.error ? <p className="admin-error">{sendState.error}</p> : null}
              {sendState.success ? <p className="admin-success">{sendState.success}</p> : null}
            </form>
          </section>
        </div>
      </section>
    </PageLayout>
  );
}
