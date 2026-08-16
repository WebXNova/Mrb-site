import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { formatAdminCourseEndDate } from '../../utils/courseStaleAdvisory';

/**
 * Admin-only advisory banner — admissions still OPEN after course end date.
 */
export default function AdmissionStaleWarning({ endDate, variant = 'banner' }) {
  const formattedEnd = formatAdminCourseEndDate(endDate);

  if (variant === 'inline') {
    return (
      <span className="admin-stale-badge" title="Admissions past end date">
        <WarningAmberOutlinedIcon sx={{ fontSize: 14 }} aria-hidden />
        Admissions past end date
      </span>
    );
  }

  return (
    <div className="course-edit-callout course-edit-callout--warning admin-stale-banner" role="status">
      <span className="course-edit-callout__icon" aria-hidden>
        !
      </span>
      <div className="course-edit-callout__body">
        <p className="course-edit-callout__title">Course end date has passed</p>
        <p className="course-edit-callout__text">
          This course&apos;s end date ({formattedEnd}) has passed, but admissions are still OPEN. New
          students can still enroll until you close admissions manually — nothing is auto-closed.
        </p>
      </div>
    </div>
  );
}

export function AccessStaleIndicator({ endDate }) {
  const formattedEnd = formatAdminCourseEndDate(endDate);
  const title = `Course end date (${formattedEnd}) has passed. Active access remains until you change it manually.`;

  return (
    <span className="admin-stale-indicator" title={title} aria-label={title}>
      <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} aria-hidden />
    </span>
  );
}
