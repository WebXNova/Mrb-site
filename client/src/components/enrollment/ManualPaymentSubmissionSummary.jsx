import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { getPaymentMethodLabel, getPaymentMethodLogoSrc } from '../../admin/utils/paymentMethodAssets.js';

function formatPkr(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  return `PKR ${n.toLocaleString('en-PK')}`;
}

function formatWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="mp-submission-summary__row">
      <dt>{label}</dt>
      <dd className={mono ? 'mp-submission-summary__mono' : undefined}>{value || '—'}</dd>
    </div>
  );
}

function StatusBanner({ status, adminNote, onRefresh, onGoToCourse, onResubmit }) {
  if (status === 'pending_review') {
    return (
      <div className="mp-submission-summary__banner mp-submission-summary__banner--review" role="status">
        <p className="mp-submission-summary__banner-title">Under review</p>
        <p className="mp-submission-summary__banner-text">
          Your payment proof was submitted and is being verified. This page refreshes automatically every 30 seconds.
        </p>
        <div className="enrollment-status-actions">
          <Button type="button" variant="secondary" size="md" onClick={onRefresh}>
            Refresh status
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="mp-submission-summary__banner mp-submission-summary__banner--approved" role="status">
        <p className="mp-submission-summary__banner-title">Payment approved — access granted</p>
        <p className="mp-submission-summary__banner-text">
          Your payment was verified. Open your course dashboard if access is not visible yet.
        </p>
        <div className="enrollment-status-actions">
          <Button as={Link} to="/dashboard/lectures" variant="accent" size="md" onClick={onGoToCourse}>
            Go to course
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="mp-submission-summary__banner mp-submission-summary__banner--rejected" role="status">
        <p className="mp-submission-summary__banner-title">Payment rejected</p>
        <p className="mp-submission-summary__banner-text">
          {adminNote
            ? adminNote
            : 'This submission was not accepted. You can send a new payment proof below.'}
        </p>
        <div className="enrollment-status-actions">
          <Button type="button" variant="accent" size="md" onClick={onResubmit}>
            Resubmit payment proof
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export default function ManualPaymentSubmissionSummary({
  submission,
  referenceCode,
  onRefresh,
  onResubmit,
}) {
  const [lightbox, setLightbox] = useState(false);
  const receiver = submission.receiverAccount;
  const method = receiver?.method || submission.paymentMethod;

  return (
    <div className="mp-submission-summary">
      <StatusBanner
        status={submission.status}
        adminNote={submission.adminNote}
        onRefresh={onRefresh}
        onResubmit={onResubmit}
      />

      <div className="mp-submission-summary__grid">
        <section className="mp-submission-summary__panel" aria-labelledby="mp-summary-receiver">
          <header className="mp-submission-summary__panel-head">
            <h2 id="mp-summary-receiver" className="heading-4">
              You paid to this account
            </h2>
            <p className="mp-submission-summary__panel-lead">Receiver details at the time you submitted.</p>
          </header>
          {receiver ? (
            <dl className="mp-submission-summary__details">
              <div className="mp-submission-summary__method">
                <img src={getPaymentMethodLogoSrc(method)} alt="" width="72" height="28" />
                <span>{getPaymentMethodLabel(method)}</span>
              </div>
              <DetailRow label="Account title" value={receiver.accountTitle} />
              <DetailRow label="Account number" value={receiver.accountNumber} mono />
            </dl>
          ) : (
            <p className="mp-submission-summary__fallback">
              {getPaymentMethodLabel(method)} — receiver account details are no longer on file.
            </p>
          )}
        </section>

        <section className="mp-submission-summary__panel" aria-labelledby="mp-summary-sender">
          <header className="mp-submission-summary__panel-head">
            <h2 id="mp-summary-sender" className="heading-4">
              You sent this
            </h2>
            <p className="mp-submission-summary__panel-lead">Details from your submitted payment proof.</p>
          </header>
          <dl className="mp-submission-summary__details">
            <DetailRow label="Sender mobile" value={submission.senderPhoneNumber} mono />
            <DetailRow label="Sender account title" value={submission.senderAccountTitle} />
            <DetailRow label="Transaction ID" value={submission.transactionId} mono />
            <DetailRow label="Amount sent" value={formatPkr(submission.amountClaimed)} />
            <DetailRow label="Submitted" value={formatWhen(submission.submittedAt)} />
            {referenceCode ? <DetailRow label="Payment reference" value={referenceCode} mono /> : null}
          </dl>
        </section>
      </div>

      {submission.hasScreenshot && submission.screenshotUrl ? (
        <section className="mp-submission-summary__screenshot" aria-labelledby="mp-summary-screenshot">
          <h2 id="mp-summary-screenshot" className="heading-4">
            Payment screenshot
          </h2>
          <button
            type="button"
            className="mp-submission-summary__thumb-btn"
            onClick={() => setLightbox(true)}
            aria-label="Enlarge payment screenshot"
          >
            <img src={submission.screenshotUrl} alt="Your submitted payment proof" />
          </button>
          <p className="mp-submission-summary__thumb-hint">Click to enlarge</p>
        </section>
      ) : null}

      {lightbox && submission.screenshotUrl ? (
        <div
          className="mp-submission-summary__lightbox"
          role="presentation"
          onClick={() => setLightbox(false)}
        >
          <img src={submission.screenshotUrl} alt="Payment screenshot enlarged" />
        </div>
      ) : null}

      <div className="enrollment-actions">
        <Button as={Link} to="/courses" variant="secondary" size="md">
          Back to courses
        </Button>
      </div>
    </div>
  );
}
