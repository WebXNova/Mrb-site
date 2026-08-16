import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import {
  formatCouponAppliedSummary,
  submissionCouponCode,
  submissionUsedCoupon,
} from '../utils/manualPaymentCouponDisplay';

/**
 * Small informational chip for list rows when a coupon was used at submission time.
 * @param {{ submission: object, className?: string }}
 */
export default function ManualPaymentCouponBadge({ submission, className = '' }) {
  if (!submissionUsedCoupon(submission)) return null;

  const code = submissionCouponCode(submission);
  if (!code) return null;

  return (
    <span className={`mp-coupon-chip ${className}`.trim()} title={`Coupon ${code} applied at submission`}>
      <LocalOfferOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
      {code}
    </span>
  );
}

/**
 * Detail-panel coupon summary near amount fields.
 * @param {{ submission: object, className?: string }}
 */
export function ManualPaymentCouponDetail({ submission, className = '' }) {
  const summary = formatCouponAppliedSummary(submission);
  if (!summary) return null;

  return (
    <p className={`mp-coupon-detail ${className}`.trim()}>
      {summary.line}
    </p>
  );
}
