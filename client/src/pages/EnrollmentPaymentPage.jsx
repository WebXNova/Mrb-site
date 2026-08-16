import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { paymentsApi } from '../api/paymentsApi.js';
import { enrollmentApi } from '../api/enrollmentApi.js';
import { ENROLLMENT_BUTTON_STATE } from '../course/courseEnrollmentCta.js';
import { getUserFacingErrorMessage, extractErrorCode } from '../utils/errorHandler';
import { getPaymentMethodLabel, getPaymentMethodLogoSrc } from '../admin/utils/paymentMethodAssets.js';
import { buildEnrollmentPaymentPath } from '../utils/enrollmentPaymentRoute.js';
import { resolveEnrollmentPaymentContext } from '../utils/resolveEnrollmentPaymentContext.js';
import ManualPaymentSubmissionSummary from '../components/enrollment/ManualPaymentSubmissionSummary.jsx';
import './EnrollmentPage.css';

const SUPPORT_WHATSAPP = 'https://wa.me/923141227364';
const STATUS_POLL_MS = 30_000;

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `PKR ${n.toLocaleString('en-PK')}`;
}

function submissionErrorMessage(err) {
  const status = Number(err?.status);
  const code = extractErrorCode(err);
  if (status === 409 || code === 'TRANSACTION_ID_ALREADY_VERIFIED') {
    return (
      err?.message ||
      'This transaction ID has already been used and verified. If you believe this is an error, contact support.'
    );
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return err?.message || 'Too many payment submissions. Please wait before trying again, or contact support.';
  }
  if (status === 503 || code === 'PAYMENT_UNAVAILABLE') {
    return 'Payment temporarily unavailable, please contact support.';
  }
  return getUserFacingErrorMessage(err, 'Could not submit payment proof. Please try again.');
}

export default function EnrollmentPaymentPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [resolvedOrderId, setResolvedOrderId] = useState(null);
  const [enrollmentId, setEnrollmentId] = useState(null);
  const [courseId, setCourseId] = useState(null);
  const [contextReady, setContextReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [submission, setSubmission] = useState({ status: 'none' });
  const [resubmitMode, setResubmitMode] = useState(false);

  const [method, setMethod] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [senderTitle, setSenderTitle] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [amountClaimed, setAmountClaimed] = useState('');
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const fileInputRef = useRef(null);

  const effectiveAmount = useMemo(() => {
    if (appliedCoupon?.discountedAmount != null) return Number(appliedCoupon.discountedAmount);
    if (checkout?.amount != null) return Number(checkout.amount);
    return null;
  }, [appliedCoupon, checkout]);

  const accountsForMethod = useMemo(() => {
    const rows = checkout?.accounts || [];
    if (!method) return rows;
    return rows.filter((row) => row.method === method);
  }, [checkout, method]);

  const selectedAccount = accountsForMethod[0] || null;
  const methods = useMemo(() => {
    const set = new Set((checkout?.accounts || []).map((row) => row.method));
    return [...set];
  }, [checkout]);

  const hasSubmission = submission.status !== 'none';
  const showSummary = hasSubmission && !(submission.status === 'rejected' && resubmitMode);
  const showPayFlow = !showSummary;
  const showForm =
    !unavailable && showPayFlow && (submission.status === 'none' || (submission.status === 'rejected' && resubmitMode));

  useEffect(() => {
    if (!screenshotFile) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(screenshotFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshotFile]);

  useEffect(() => {
    let cancelled = false;

    async function resolveContext() {
      setLoading(true);
      setError('');
      setContextReady(false);
      setResolvedOrderId(null);
      setCheckout(null);
      setSubmission({ status: 'none' });
      setResubmitMode(false);
      setCouponInput('');
      setAppliedCoupon(null);
      setCouponError('');

      try {
        const context = await resolveEnrollmentPaymentContext({
          searchParams,
          locationState: location.state,
        });
        if (cancelled) return;

        if (context.kind === 'already_active') {
          navigate('/dashboard/lectures', { replace: true });
          return;
        }

        if (context.kind === 'missing') {
          setError('Missing order. Please complete enrollment again from the course page.');
          setLoading(false);
          setContextReady(true);
          return;
        }

        setResolvedOrderId(context.orderId);
        setEnrollmentId(context.enrollmentId);
        setCourseId(context.courseId);

        const canonicalPath = buildEnrollmentPaymentPath({
          orderId: context.orderId,
          courseId: context.courseId,
        });
        if (`${location.pathname}${location.search}` !== canonicalPath) {
          navigate(canonicalPath, { replace: true, state: location.state });
        }

        setContextReady(true);
      } catch (err) {
        if (cancelled) return;
        setError(getUserFacingErrorMessage(err, 'Could not load your payment session.'));
        setLoading(false);
        setContextReady(true);
      }
    }

    resolveContext();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, location.state, navigate, searchParams]);

  useEffect(() => {
    if (!contextReady || !resolvedOrderId) return undefined;

    let cancelled = false;

    async function loadOrderData() {
      setLoading(true);
      setError('');
      setUnavailable(false);

      try {
        const statusRes = await paymentsApi.getManualStatus(resolvedOrderId);
        if (cancelled) return;
        const statusPayload = statusRes?.data ?? { status: 'none' };
        setSubmission(statusPayload);
        setResubmitMode(false);

        if (statusPayload.status === 'approved' || statusPayload.status === 'pending_review') {
          setCheckout(null);
          return;
        }

        if (statusPayload.status === 'rejected') {
          setCheckout(null);
          return;
        }

        try {
          const infoRes = await paymentsApi.getManualCheckoutInfo(resolvedOrderId);
          if (cancelled) return;
          const info = infoRes?.data ?? null;
          setCheckout(info);
          if (info?.enrollmentId != null) setEnrollmentId(Number(info.enrollmentId));
          if (info?.courseId != null) setCourseId(Number(info.courseId));
          const availableMethods = [...new Set((info?.accounts || []).map((row) => row.method))];
          setMethod((current) => current || availableMethods[0] || '');
          setAmountClaimed((current) => current || (info?.amount != null ? String(info.amount) : ''));
          setCouponInput('');
          setAppliedCoupon(null);
          setCouponError('');
        } catch (err) {
          if (cancelled) return;
          const code = extractErrorCode(err);
          if (Number(err?.status) === 409 && code === 'ORDER_NOT_SUBMITTABLE') {
            if (statusPayload.status === 'approved') {
              return;
            }
            if (courseId) {
              const stateRes = await enrollmentApi.getState(courseId);
              if (stateRes?.data?.buttonState === ENROLLMENT_BUTTON_STATE.CONTINUE_LEARNING) {
                navigate('/dashboard/lectures', { replace: true });
                return;
              }
            }
            setError('This order is no longer awaiting payment. If you already paid, check your dashboard.');
            return;
          }
          throw err;
        }
      } catch (err) {
        if (cancelled) return;
        const code = extractErrorCode(err);
        if (Number(err?.status) === 503 || code === 'PAYMENT_UNAVAILABLE') {
          setUnavailable(true);
          setError('Payment temporarily unavailable, please contact support.');
        } else {
          setError(getUserFacingErrorMessage(err, 'Could not load payment instructions.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadOrderData();
    return () => {
      cancelled = true;
    };
  }, [contextReady, resolvedOrderId, courseId, navigate]);

  useEffect(() => {
    if (!resubmitMode || !resolvedOrderId || checkout || unavailable) return undefined;

    let cancelled = false;

    async function loadCheckoutForResubmit() {
      try {
        const infoRes = await paymentsApi.getManualCheckoutInfo(resolvedOrderId);
        if (cancelled) return;
        const info = infoRes?.data ?? null;
        setCheckout(info);
        const availableMethods = [...new Set((info?.accounts || []).map((row) => row.method))];
        setMethod((current) => current || availableMethods[0] || '');
        setAmountClaimed((current) => current || (info?.amount != null ? String(info.amount) : ''));
        setCouponInput('');
        setAppliedCoupon(null);
        setCouponError('');
      } catch (err) {
        if (cancelled) return;
        setError(getUserFacingErrorMessage(err, 'Could not load payment instructions for resubmission.'));
      }
    }

    loadCheckoutForResubmit();
    return () => {
      cancelled = true;
    };
  }, [resubmitMode, resolvedOrderId, checkout, unavailable]);

  useEffect(() => {
    if (!resolvedOrderId || submission.status !== 'pending_review') return undefined;

    async function refreshStatus() {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await paymentsApi.getManualStatus(resolvedOrderId);
        setSubmission(res?.data ?? { status: 'none' });
      } catch {
        /* keep last known status */
      }
    }

    const timer = window.setInterval(refreshStatus, STATUS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshStatus();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resolvedOrderId, submission.status]);

  async function handleApplyCoupon() {
    if (!resolvedOrderId || applyingCoupon) return;
    const code = String(couponInput ?? '').trim();
    if (!code) {
      setCouponError('Enter a coupon code.');
      return;
    }

    setApplyingCoupon(true);
    setCouponError('');
    try {
      const res = await paymentsApi.validateManualPaymentCoupon(resolvedOrderId, code);
      const data = res?.data ?? null;
      if (!data?.valid) {
        setAppliedCoupon(null);
        setCouponError('Could not apply this coupon.');
        return;
      }
      setAppliedCoupon(data);
      setCouponInput(String(data.code || code).toUpperCase());
      setAmountClaimed(String(data.discountedAmount));
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err?.message || 'Could not apply this coupon.');
      if (checkout?.amount != null) {
        setAmountClaimed(String(checkout.amount));
      }
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!resolvedOrderId || submitting) return;
    if (!screenshotFile) {
      setError('Please attach a screenshot of your payment.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('payment_method', method);
      formData.append('sender_phone_number', senderPhone);
      formData.append('sender_account_title', senderTitle);
      formData.append('transaction_id', transactionId);
      formData.append('amount_claimed', amountClaimed);
      if (appliedCoupon?.code) {
        formData.append('coupon_code', appliedCoupon.code);
      }
      formData.append('screenshot', screenshotFile);

      const res = await paymentsApi.submitManualPayment(resolvedOrderId, formData);
      setSubmission(res?.data ?? { status: 'pending_review' });
      setResubmitMode(false);
      setCheckout(null);
    } catch (err) {
      setError(submissionErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefresh() {
    if (!resolvedOrderId) return;
    try {
      const res = await paymentsApi.getManualStatus(resolvedOrderId);
      setSubmission(res?.data ?? { status: 'none' });
    } catch (err) {
      setError(getUserFacingErrorMessage(err, 'Could not refresh payment status.'));
    }
  }

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card enrollment-payment-next">
          <header className="enrollment-header">
            <p className="enrollment-step">Payment</p>
            <h1 className="heading-2">
              {showSummary ? 'Your payment submission' : 'Pay with JazzCash or EasyPaisa'}
            </h1>
            <p className="enrollment-subtitle">
              {showSummary
                ? 'Review what you submitted below. Access is granted after verification — not on this page.'
                : 'Transfer the course fee to the account below, then upload your payment proof. Access is granted after verification — not on this page.'}
            </p>
          </header>

          {loading ? (
            <p className="enrollment-status-message">
              {showSummary ? 'Loading your submission…' : 'Loading payment instructions…'}
            </p>
          ) : null}

          {error ? (
            <p className="enrollment-error" role="alert">
              {error}{' '}
              {unavailable ? (
                <a href={SUPPORT_WHATSAPP} target="_blank" rel="noreferrer">
                  Contact support on WhatsApp
                </a>
              ) : null}
            </p>
          ) : null}

          {unavailable && !loading ? (
            <div className="enrollment-actions">
              <Button as="a" href={SUPPORT_WHATSAPP} variant="accent" size="md">
                Contact support
              </Button>
              <Button as={Link} to="/courses" variant="secondary" size="md">
                Back to courses
              </Button>
            </div>
          ) : null}

          {!loading && !unavailable && showSummary ? (
            <ManualPaymentSubmissionSummary
              submission={submission}
              referenceCode={submission.referenceCode ?? checkout?.referenceCode ?? null}
              onRefresh={handleRefresh}
              onResubmit={() => {
                setResubmitMode(true);
                setError('');
              }}
            />
          ) : null}

          {!loading && showPayFlow && resubmitMode && !checkout && !unavailable ? (
            <p className="enrollment-status-message">Loading payment instructions for a new submission…</p>
          ) : null}

          {!loading && showPayFlow && checkout && !unavailable ? (
            <>
              <div className="enrollment-payment-next__summary">
                <p>
                  <strong>Amount due:</strong>{' '}
                  {appliedCoupon ? (
                    <>
                      <span className="enrollment-payment-next__amount-original">{formatPkr(checkout.amount)}</span>{' '}
                      <span className="enrollment-payment-next__amount-discounted">
                        {formatPkr(effectiveAmount)}
                      </span>
                    </>
                  ) : (
                    formatPkr(checkout.amount)
                  )}
                </p>
                {appliedCoupon ? (
                  <p className="enrollment-payment-next__coupon-applied">
                    Coupon <strong>{appliedCoupon.code}</strong> applied —{' '}
                    {formatPkr(appliedCoupon.discountApplied)} off
                  </p>
                ) : null}
                <p>
                  <strong>Payment reference:</strong> {checkout.referenceCode}
                </p>
                {enrollmentId ? (
                  <p>
                    <strong>Enrollment ID:</strong> {enrollmentId}
                  </p>
                ) : null}
              </div>

              {methods.length > 1 ? (
                <div className="enrollment-radio-row" role="tablist" aria-label="Payment method">
                  {methods.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`enrollment-option${method === id ? ' is-selected' : ''}`}
                      onClick={() => setMethod(id)}
                    >
                      <img src={getPaymentMethodLogoSrc(id)} alt="" width="72" height="28" />
                      <span>{getPaymentMethodLabel(id)}</span>
                    </button>
                  ))}
                </div>
              ) : selectedAccount ? (
                <p className="enrollment-course-name">{getPaymentMethodLabel(selectedAccount.method)}</p>
              ) : null}

              {selectedAccount ? (
                <article className="enrollment-payment-next__notice">
                  <p>
                    Send {formatPkr(effectiveAmount ?? checkout.amount)} to{' '}
                    <strong>{selectedAccount.accountTitle}</strong> ({getPaymentMethodLabel(selectedAccount.method)}{' '}
                    {selectedAccount.accountNumber}). Include reference <strong>{checkout.referenceCode}</strong> in
                    the transfer description if your app allows it.
                  </p>
                </article>
              ) : null}

              {showForm ? (
                <form className="enrollment-form" onSubmit={handleSubmit}>
                  <div className="enrollment-field enrollment-payment-next__coupon">
                    <label htmlFor="coupon-code">Have a coupon code?</label>
                    <div className="enrollment-payment-next__coupon-row">
                      <input
                        id="coupon-code"
                        type="text"
                        value={couponInput}
                        onChange={(event) => {
                          setCouponInput(event.target.value.toUpperCase());
                          if (appliedCoupon) {
                            setAppliedCoupon(null);
                            setCouponError('');
                            if (checkout?.amount != null) {
                              setAmountClaimed(String(checkout.amount));
                            }
                          }
                        }}
                        placeholder="e.g. SAVE20"
                        autoComplete="off"
                        maxLength={32}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        disabled={applyingCoupon || !couponInput.trim()}
                        onClick={handleApplyCoupon}
                      >
                        {applyingCoupon ? 'Applying…' : 'Apply'}
                      </Button>
                    </div>
                    {couponError ? (
                      <p className="enrollment-error enrollment-payment-next__coupon-error" role="alert">
                        {couponError}
                      </p>
                    ) : null}
                  </div>
                  <div className="enrollment-field">
                    <label htmlFor="sender-phone">
                      Sender mobile number <span>*</span>
                    </label>
                    <input
                      id="sender-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={senderPhone}
                      onChange={(event) => setSenderPhone(event.target.value)}
                      required
                    />
                  </div>
                  <div className="enrollment-field">
                    <label htmlFor="sender-title">
                      Sender account title <span>*</span>
                    </label>
                    <input
                      id="sender-title"
                      type="text"
                      value={senderTitle}
                      onChange={(event) => setSenderTitle(event.target.value)}
                      required
                    />
                  </div>
                  <div className="enrollment-field">
                    <label htmlFor="trx-id">
                      Transaction ID <span>*</span>
                    </label>
                    <input
                      id="trx-id"
                      type="text"
                      value={transactionId}
                      onChange={(event) => setTransactionId(event.target.value)}
                      required
                    />
                  </div>
                  <div className="enrollment-field">
                    <label htmlFor="amount-claimed">
                      Amount sent (PKR) <span>*</span>
                    </label>
                    <input
                      id="amount-claimed"
                      type="number"
                      min="1"
                      step="1"
                      value={amountClaimed}
                      onChange={(event) => setAmountClaimed(event.target.value)}
                      required
                    />
                  </div>
                  <div className="enrollment-field">
                    <label htmlFor="screenshot">
                      Payment screenshot (JPG or PNG, max 5 MB) <span>*</span>
                    </label>
                    <input
                      id="screenshot"
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                      onChange={(event) => setScreenshotFile(event.target.files?.[0] || null)}
                      required
                    />
                    {previewUrl ? (
                      <img className="enrollment-payment-preview" src={previewUrl} alt="Screenshot preview" />
                    ) : null}
                  </div>
                  <div className="enrollment-actions">
                    <Button as={Link} to={courseId ? `/enroll/${courseId}` : '/courses'} variant="secondary" size="md">
                      Back
                    </Button>
                    <Button type="submit" variant="accent" size="md" disabled={submitting || !selectedAccount}>
                      {submitting ? (
                        <>
                          <span className="enrollment-spinner" aria-hidden="true" />
                          Submitting…
                        </>
                      ) : (
                        'Submit payment proof'
                      )}
                    </Button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {!loading && !checkout && !unavailable && contextReady && !resolvedOrderId ? (
            <div className="enrollment-actions">
              <Button as={Link} to="/courses" variant="accent" size="md">
                Browse courses
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </PageLayout>
  );
}
