import PageLayout from '../components/layout/PageLayout';
import { useEffect, useRef, useState } from 'react';
import { inferApiFailureMessage } from '../api/apiErrors';
import { getApiBaseUrl } from '../api/runtimeConfig';
import SocialMediaLinks from '../components/ui/SocialMediaLinks';
import './ContactPage.css';

const PK_MOBILE_RE = /^03\d{9}$/;

function normalizeWhatsapp(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.startsWith('3') && digits.length === 10) digits = `0${digits}`;
  return digits;
}

export default function ContactPage() {
  const formLoadedAtRef = useRef(Date.now());
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [remark, setRemark] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState({ error: '', success: '' });
  const [honeypot, setHoneypot] = useState('');

  useEffect(() => {
    formLoadedAtRef.current = Date.now();
  }, []);

  async function submitRemark(event) {
    event.preventDefault();
    setSendState({ error: '', success: '' });

    const trimmedName = name.trim();
    const normalizedWhatsapp = normalizeWhatsapp(whatsapp);
    const trimmedMessage = remark.trim();
    const trimmedEmail = email.trim();

    if (trimmedName.length < 2) {
      setSendState({ error: 'Please enter your name (at least 2 characters).', success: '' });
      return;
    }
    if (!PK_MOBILE_RE.test(normalizedWhatsapp)) {
      setSendState({ error: 'Enter a valid WhatsApp number (e.g. 03XXXXXXXXX).', success: '' });
      return;
    }
    if (trimmedMessage.length < 5) {
      setSendState({ error: 'Your remark must be at least 5 characters.', success: '' });
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/contact/remarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: trimmedName,
          whatsapp: normalizedWhatsapp,
          email: trimmedEmail || null,
          message: trimmedMessage,
          pageUrl: '/contact',
          _hp: honeypot,
          formLoadedAt: formLoadedAtRef.current,
        }),
      });
      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }
      if (!response.ok) {
        throw new Error(inferApiFailureMessage(data, { status: response.status, statusText: response.statusText, rawText }));
      }
      setRemark('');
      setName('');
      setWhatsapp('');
      setEmail('');
      setSendState({ error: '', success: 'Remark sent successfully. Thank you!' });
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
            For billing, enrollment, or general queries, write to us at{' '}
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
            <p className="body-md contact-block__text">
              Share your feedback or suggestion. Our team will review it in the admin panel.
            </p>
            <form className="contact-remark-form" onSubmit={submitRemark}>
              <div className="contact-remark-form__hp" aria-hidden="true">
                <label htmlFor="remarkWebsite">Website</label>
                <input
                  id="remarkWebsite"
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(event) => setHoneypot(event.target.value)}
                />
              </div>

              <label className="contact-remark-form__label" htmlFor="remarkName">
                Full name
              </label>
              <input
                id="remarkName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                required
                minLength={2}
                autoComplete="name"
              />

              <label className="contact-remark-form__label" htmlFor="remarkWhatsapp">
                WhatsApp number
              </label>
              <input
                id="remarkWhatsapp"
                type="tel"
                inputMode="tel"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="03XXXXXXXXX"
                required
                autoComplete="tel"
              />

              <label className="contact-remark-form__label" htmlFor="remarkEmail">
                Email (optional)
              </label>
              <input
                id="remarkEmail"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
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
                minLength={5}
              />

              <button className="btn btn--primary" type="submit" disabled={isSending}>
                {isSending ? 'Sending…' : 'Send Remark'}
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
