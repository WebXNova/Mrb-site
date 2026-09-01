import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { standaloneTestsApi, markPaidStandaloneSession } from '../api/standaloneTestsApi';
import { getUserFacingErrorMessage, extractErrorCode } from '../utils/errorHandler';
import { getPaymentMethodLabel, getPaymentMethodLogoSrc } from '../admin/utils/paymentMethodAssets.js';
import { usePageSeo } from '../seo/SeoContext';
import CopyableField from '../components/payment/CopyableField.jsx';
import PaymentFileUpload from '../components/payment/PaymentFileUpload.jsx';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconListCheck,
  IconLock,
} from '../components/public-tests/testsUiIcons.jsx';
import './paid-test-payment.css';

const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;
const SCREENSHOT_ALLOWED_MIME = /^(image\/jpeg|image\/jpg|image\/png)$/i;
const SCREENSHOT_ALLOWED_EXT = /\.(jpe?g|png)$/i;

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `Rs. ${n.toLocaleString('en-PK')}`;
}

function screenshotFileError(selected) {
  if (!selected) return 'Upload a JPEG or PNG screenshot of the transfer.';
  if (!selected.size) return 'The selected file is empty. Choose another screenshot.';
  if (selected.size > SCREENSHOT_MAX_BYTES) return 'Screenshot must be 5 MB or smaller.';
  const mime = String(selected.type || '').toLowerCase();
  const name = String(selected.name || '').toLowerCase();
  const mimeIsImage = SCREENSHOT_ALLOWED_MIME.test(mime);
  const extIsImage = SCREENSHOT_ALLOWED_EXT.test(name);
  if (mimeIsImage || extIsImage) return '';
  const mimeUnknown = !mime || mime === 'application/octet-stream';
  if (mimeUnknown && !name.includes('.')) return '';
  return 'Screenshot must be a JPG or PNG image.';
}

export default function PaidTestPaymentPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = Number(searchParams.get('order_id'));
  const [checkout, setCheckout] = useState(null);
  const [status, setStatus] = useState({ status: 'none' });
  const [method, setMethod] = useState('jazzcash');
  const [trx, setTrx] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [touched, setTouched] = useState({});

  const testPath = `/paid-tests/${encodeURIComponent(slug)}`;

  usePageSeo({
    title: 'Pay for paid test | MRB Classes',
    description: 'Submit JazzCash or EasyPaisa payment proof for your MRB Classes test.',
    noindex: true,
  });

  useEffect(() => {
    markPaidStandaloneSession(slug);
  }, [slug]);

  useEffect(() => {
    if (!Number.isInteger(orderId) || orderId <= 0) {
      setError('Missing payment reference. Return to the test page and continue from there.');
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const st = await standaloneTestsApi.status(orderId);
        if (cancelled) return;
        const statusData = st?.data || { status: 'none' };
        setStatus(statusData);
        const orderStatus = String(statusData.orderStatus || statusData.status || 'none');
        const alreadySubmitted =
          orderStatus === 'pending_review' ||
          orderStatus === 'under_review' ||
          orderStatus === 'approved' ||
          Boolean(statusData.seatConfirmed);
        if (alreadySubmitted) return;
        const info = await standaloneTestsApi.checkoutInfo(orderId);
        if (!cancelled) setCheckout(info?.data || null);
      } catch (err) {
        if (!cancelled) setError(getUserFacingErrorMessage(err, 'Could not load payment instructions.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const paymentMethods = useMemo(() => {
    const ids = [
      ...new Set(
        (checkout?.accounts || [])
          .map((row) => String(row.method || '').toLowerCase())
          .filter(Boolean)
      ),
    ];
    return ids.length ? ids : ['jazzcash', 'easypaisa'];
  }, [checkout]);

  useEffect(() => {
    const first = paymentMethods[0];
    if (first && !paymentMethods.includes(method)) setMethod(first);
  }, [paymentMethods, method]);

  const accounts = useMemo(
    () =>
      (checkout?.accounts || []).filter(
        (row) => String(row.method || '').toLowerCase() === String(method || '').toLowerCase()
      ),
    [checkout, method]
  );
  const destination = accounts[0] || null;

  const orderStatus = String(status.orderStatus || status.status || 'none');
  const underReview =
    orderStatus === 'pending_review' || orderStatus === 'under_review' || status.status === 'pending_review';
  const approved = orderStatus === 'approved' || Boolean(status.seatConfirmed);
  const canSubmit = !underReview && !approved;
  const referenceCode = status.referenceCode || checkout?.referenceCode || null;

  function validate() {
    const next = {};
    if (!title.trim()) next.title = 'Enter the sender account title.';
    if (!phone.trim()) next.phone = 'Enter the sender mobile number.';
    if (!trx.trim()) next.trx = 'Enter the transaction ID.';
    const fileReason = screenshotFileError(file);
    if (fileReason) next.file = fileReason;
    return next;
  }

  function onScreenshotSelected(selected) {
    if (!selected) {
      setFile(null);
      setFieldErrors((prev) => {
        if (!prev.file) return prev;
        const next = { ...prev };
        delete next.file;
        return next;
      });
      return;
    }
    const reason = screenshotFileError(selected);
    if (reason) {
      setFile(null);
      setFieldErrors((prev) => ({ ...prev, file: reason }));
      return;
    }
    setFile(selected);
    setFieldErrors((prev) => {
      if (!prev.file) return prev;
      const next = { ...prev };
      delete next.file;
      return next;
    });
  }

  function clearFieldError(name) {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function markTouched(name) {
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
  }

  function fieldClass(name, value) {
    if (fieldErrors[name]) return 'ptp-field__control is-invalid';
    if (touched[name] && String(value || '').trim()) return 'ptp-field__control is-valid';
    return 'ptp-field__control';
  }

  async function onSubmit(event) {
    event.preventDefault();
    const next = validate();
    if (Object.keys(next).length) {
      setFieldErrors(next);
      setError('Please complete the payment form before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const formData = new FormData();
      formData.append('payment_method', method);
      formData.append('sender_phone_number', phone.trim());
      formData.append('sender_account_title', title.trim());
      formData.append('transaction_id', trx.trim());
      formData.append('amount_claimed', String(checkout.amount));
      formData.append('screenshot', file);
      await standaloneTestsApi.submitPayment(orderId, formData);
      const st = await standaloneTestsApi.status(orderId);
      setStatus(st?.data || { status: 'pending_review' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[paid-test-payment] screenshot submit failed', {
        status: err?.status ?? null,
        code: extractErrorCode(err),
        message: err?.message || null,
        fileName: file?.name || null,
        fileSize: file?.size ?? null,
        mimeType: file?.type || null,
      });
      const code = extractErrorCode(err);
      setError(
        code === 'RATE_LIMITED'
          ? 'Too many payment submissions. Please wait before trying again.'
          : getUserFacingErrorMessage(err, 'Screenshot upload failed. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <div className="ptp">
        <div className="ptp__wrap">
          <Link className="ptp__back" to={testPath}>
            <IconArrowLeft size={16} />
            Back to test
          </Link>

          <header className="ptp__hero">
            <p className="ptp__eyebrow">Payment</p>
            <h1 className="ptp__title">Complete your registration</h1>
            <p className="ptp__test">{checkout?.testTitle || 'Paid test'}</p>
            <p className="ptp__amount">{formatPkr(checkout?.amount)}</p>
          </header>

          {error ? (
            <p className="ptp-alert" role="alert">
              {error}
            </p>
          ) : null}

          {loading ? (
            <div className="ptp__layout" aria-hidden="true">
              <div className="ptp-skel" />
              <div className="ptp-skel" />
            </div>
          ) : null}

          {underReview ? (
            <div className="ptp-success" role="status">
              <h2>
                <IconCheck size={20} /> Payment proof submitted
              </h2>
              <p>Your registration is now awaiting admin approval. A confirmed seat does not open the exam until MRB Classes opens it.</p>
              {referenceCode ? (
                <p>
                  Reference: <span className="ptp-success__ref">{referenceCode}</span>
                </p>
              ) : null}
              <div className="ptp-actions">
                <Button as={Link} to="/paid-tests" variant="secondary">
                  Back to tests
                </Button>
              </div>
            </div>
          ) : null}

          {approved ? (
            <div className="ptp-success" role="status">
              <h2>
                <IconCheck size={20} /> Seat confirmed
              </h2>
              <p>
                If the exam is still closed, wait until MRB Classes opens it, then start from the test page.
              </p>
              {referenceCode ? (
                <p>
                  Reference: <span className="ptp-success__ref">{referenceCode}</span>
                </p>
              ) : null}
              <div className="ptp-actions">
                <Button as={Link} to={testPath}>
                  Go to test page
                </Button>
              </div>
            </div>
          ) : null}

          {!loading && canSubmit ? (
            <div className="ptp__layout">
              <div className="ptp-col">
                <section className="ptp-card" aria-labelledby="ptp-summary-heading">
                  <p className="ptp-card__kicker">Registration</p>
                  <h2 id="ptp-summary-heading" className="ptp-summary__name">
                    {checkout?.testTitle || 'Entry test'}
                  </h2>
                  {(checkout?.questionCount || checkout?.durationMinutes) ? (
                    <div className="ptp-summary__stats">
                      {checkout?.questionCount ? (
                        <div className="ptp-summary__stat">
                          <span>
                            <IconListCheck size={14} /> Questions
                          </span>
                          <strong>{checkout.questionCount}</strong>
                        </div>
                      ) : null}
                      {checkout?.durationMinutes ? (
                        <div className="ptp-summary__stat">
                          <span>
                            <IconClock size={14} /> Duration
                          </span>
                          <strong>{checkout.durationMinutes} min</strong>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="ptp-summary__fee">
                    <span>Registration fee</span>
                    <strong>{formatPkr(checkout?.amount)}</strong>
                  </div>
                  <p className="ptp-status">Registration open</p>
                </section>

                <section className="ptp-card" aria-labelledby="ptp-dest-heading">
                  <h2 id="ptp-dest-heading" className="ptp-card__title">
                    Payment destination
                  </h2>
                  <div className="ptp-methods" role="radiogroup" aria-label="Payment method">
                    {paymentMethods.map((id) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={method === id}
                        className={`ptp-method${method === id ? ' ptp-method--active' : ''}`}
                        onClick={() => setMethod(id)}
                      >
                        <img src={getPaymentMethodLogoSrc(id)} alt="" />
                        {getPaymentMethodLabel(id)}
                      </button>
                    ))}
                  </div>

                  {destination ? (
                    <div className="ptp-dest">
                      <p className="ptp-dest__method">{getPaymentMethodLabel(method)}</p>
                      <CopyableField label="Account title" value={destination.accountTitle} />
                      <CopyableField label="Mobile number" value={destination.accountNumber} />
                      <CopyableField
                        label="Amount"
                        value={formatPkr(checkout?.amount)}
                        copyValue={String(checkout?.amount ?? '')}
                      />
                    </div>
                  ) : (
                    <p className="ptp-alert" role="status">
                      Payment account details are not available right now. Try again shortly.
                    </p>
                  )}
                </section>
              </div>

              <form className="ptp-card ptp-form" onSubmit={onSubmit} noValidate>
                <h2 className="ptp-card__title">Submit payment proof</h2>

                <div className="ptp-field">
                  <label className="ptp-field__label" htmlFor="paid-pay-title">
                    Sender account title
                  </label>
                  <input
                    id="paid-pay-title"
                    className={fieldClass('title', title)}
                    value={title}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      clearFieldError('title');
                    }}
                    onBlur={() => markTouched('title')}
                    autoComplete="name"
                    aria-invalid={Boolean(fieldErrors.title)}
                    aria-describedby={fieldErrors.title ? 'paid-pay-title-error' : undefined}
                    required
                  />
                  {fieldErrors.title ? (
                    <p className="ptp-field__error" id="paid-pay-title-error" role="alert">
                      {fieldErrors.title}
                    </p>
                  ) : null}
                </div>

                <div className="ptp-field">
                  <label className="ptp-field__label" htmlFor="paid-pay-phone">
                    Sender mobile number
                  </label>
                  <input
                    id="paid-pay-phone"
                    className={fieldClass('phone', phone)}
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      clearFieldError('phone');
                    }}
                    onBlur={() => markTouched('phone')}
                    autoComplete="tel"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? 'paid-pay-phone-error' : 'paid-pay-phone-hint'}
                    required
                  />
                  {fieldErrors.phone ? (
                    <p className="ptp-field__error" id="paid-pay-phone-error" role="alert">
                      {fieldErrors.phone}
                    </p>
                  ) : (
                    <p className="ptp-field__hint" id="paid-pay-phone-hint">
                      The number you sent the payment from.
                    </p>
                  )}
                </div>

                <div className="ptp-field">
                  <label className="ptp-field__label" htmlFor="paid-pay-trx">
                    Transaction ID
                  </label>
                  <input
                    id="paid-pay-trx"
                    className={fieldClass('trx', trx)}
                    value={trx}
                    onChange={(e) => {
                      setTrx(e.target.value);
                      clearFieldError('trx');
                    }}
                    onBlur={() => markTouched('trx')}
                    autoComplete="off"
                    aria-invalid={Boolean(fieldErrors.trx)}
                    aria-describedby={fieldErrors.trx ? 'paid-pay-trx-error' : 'paid-pay-trx-hint'}
                    required
                  />
                  {fieldErrors.trx ? (
                    <p className="ptp-field__error" id="paid-pay-trx-error" role="alert">
                      {fieldErrors.trx}
                    </p>
                  ) : (
                    <p className="ptp-field__hint" id="paid-pay-trx-hint">
                      Copy the ID from your JazzCash or EasyPaisa receipt.
                    </p>
                  )}
                </div>

                <div className="ptp-field">
                  <span className="ptp-field__label" id="paid-pay-file-label">
                    Payment screenshot
                  </span>
                  <PaymentFileUpload
                    id="paid-pay-file"
                    labelledBy="paid-pay-file-label"
                    file={file}
                    error={fieldErrors.file}
                    disabled={submitting}
                    onFileChange={onScreenshotSelected}
                  />
                </div>

                <ul className="ptp-trust">
                  <li>
                    <IconLock size={14} /> Secure submission
                  </li>
                  <li>
                    <IconCheck size={14} /> Payment reviewed manually
                  </li>
                  <li>
                    <IconCheck size={14} /> Seat confirmed after approval
                  </li>
                </ul>

                <div className="ptp-actions">
                  <Button type="button" variant="secondary" onClick={() => navigate(testPath)}>
                    Back to test
                  </Button>
                  <button className="ptp-submit" type="submit" disabled={submitting || !destination}>
                    {submitting ? <span className="ptp-spinner" aria-hidden="true" /> : null}
                    {submitting ? 'Submitting…' : 'Submit payment proof'}
                    {submitting ? null : <IconArrowRight size={16} />}
                  </button>
                </div>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </PageLayout>
  );
}
