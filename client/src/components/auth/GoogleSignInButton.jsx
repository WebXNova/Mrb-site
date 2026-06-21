import { useEffect, useRef, useState } from 'react';

const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gisScriptPromise = null;
/** GIS `initialize` must run once per page load — not per component mount. */
let gisInitializedClientId = null;

function loadGoogleIdentityScript() {
  if (typeof window !== 'undefined' && window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

/**
 * Google Identity Services button (renders official GIS widget).
 * @param {{ onCredential: (credential: string) => void | Promise<void>, disabled?: boolean, text?: 'signin_with' | 'signup_with' | 'continue_with' }} props
 */
export default function GoogleSignInButton({ onCredential, disabled = false, text = 'signin_with' }) {
  const containerRef = useRef(null);
  const onCredentialRef = useRef(onCredential);
  const [loadError, setLoadError] = useState('');
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();

  onCredentialRef.current = onCredential;

  useEffect(() => {
    if (!clientId || disabled) return undefined;

    let cancelled = false;

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !containerRef.current) return;

        if (gisInitializedClientId !== clientId) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: (response) => {
              const credential = response?.credential;
              if (credential) {
                void onCredentialRef.current(credential);
              }
            },
            auto_select: false,
            cancel_on_tap_outside: true,
            context: text === 'signup_with' ? 'signup' : 'signin',
          });
          gisInitializedClientId = clientId;
        }

        const width = Math.max(containerRef.current.offsetWidth || 0, 280);
        containerRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(containerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          width,
          logo_alignment: 'left',
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError('Google Sign-In is temporarily unavailable.');
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, text]);

  if (!clientId) {
    return (
      <p className="auth-social__hint" role="status">
        Google Sign-In is not configured for this environment.
      </p>
    );
  }

  if (loadError) {
    return <p className="admin-error auth-form__error">{loadError}</p>;
  }

  return (
    <div
      ref={containerRef}
      className={`auth-google-button${disabled ? ' auth-google-button--disabled' : ''}`}
      aria-hidden={disabled ? 'true' : undefined}
    />
  );
}
