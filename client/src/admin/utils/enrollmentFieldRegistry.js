/**
 * Single source of truth for enrollment field labels, ordering, and value formatting.
 *
 * The registrations admin page detail panel, the per-row Excel export, and the batch
 * Excel export all read from this file — when the underlying enrollment shape gains a
 * field, only this file changes.
 *
 * Labels intentionally mirror the student-facing `EnrollmentForm.jsx` so admins see the
 * exact field names students filled in.
 */

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function formatDateLong(value) {
  if (isBlank(value)) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatDateShort(value) {
  if (isBlank(value)) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

export function formatEnrollmentDate(value) {
  return formatDateLong(value);
}

export function formatEnrollmentDateShort(value) {
  return formatDateShort(value);
}

export function formatEnrollmentGender(value) {
  if (isBlank(value)) return '-';
  const normalized = String(value).toLowerCase();
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return String(value);
}

export function formatEnrollmentStatus(value) {
  if (isBlank(value)) return '-';
  const s = String(value);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function formatEnrollmentAccessStatus(value) {
  if (isBlank(value)) return 'Inactive';
  return formatEnrollmentStatus(value);
}

export function formatEnrollmentUserAccountStatus(value) {
  if (isBlank(value)) return '-';
  return formatEnrollmentStatus(value);
}

export function formatEnrollmentOrderStatus(orderStatus, orderId) {
  if (isBlank(orderId)) return 'No order';
  if (isBlank(orderStatus)) return 'Unknown';
  return formatEnrollmentStatus(orderStatus);
}

export function formatEnrollmentOrderAmount(amount, currency) {
  if (isBlank(amount)) return '-';
  const num = Number(amount);
  if (!Number.isFinite(num)) return '-';
  return `${num.toFixed(2)} ${currency || 'PKR'}`;
}

function plain(value) {
  return isBlank(value) ? '-' : String(value);
}

/**
 * Sections describe the detail panel layout (and double as group headers for the
 * single-record Excel export). Keep section order aligned with `EnrollmentForm.jsx`.
 *
 * Field shape:
 *   {
 *     key:    string  — stable identifier; reused as Excel column key
 *     label:  string  — human label rendered in the UI and Excel
 *     format: (enrollment) => string  — produces the displayable string
 *   }
 */
export const ENROLLMENT_FIELD_SECTIONS = [
  {
    id: 'applicantContact',
    title: 'Applicant & contact',
    fields: [
      { key: 'email', label: 'Email Address', format: (e) => plain(e.email) },
      { key: 'applicantFullName', label: "Applicant's Full Name", format: (e) => plain(e.applicantFullName) },
      { key: 'fatherName', label: "Father's Name", format: (e) => plain(e.fatherName) },
      { key: 'dateOfBirth', label: 'Date of Birth', format: (e) => formatDateShort(e.dateOfBirth) },
      { key: 'gender', label: 'Gender', format: (e) => formatEnrollmentGender(e.gender) },
      { key: 'whatsappNumber', label: 'WhatsApp Number', format: (e) => plain(e.whatsappNumber) },
    ],
  },
  {
    id: 'locationAcademics',
    title: 'Location & academics',
    fields: [
      { key: 'province', label: 'Province', format: (e) => plain(e.province) },
      { key: 'district', label: 'District', format: (e) => plain(e.district) },
      { key: 'city', label: 'City', format: (e) => plain(e.city) },
      { key: 'hsscStatus', label: 'Intermediate / HSSC Status', format: (e) => plain(e.hsscStatus) },
      { key: 'board', label: 'Pre-Medical Intermediate Board', format: (e) => plain(e.board) },
      { key: 'mdcatAttemptType', label: 'MDCAT Attempt History', format: (e) => plain(e.mdcatAttemptType) },
    ],
  },
  {
    id: 'coursePayment',
    title: 'Course & payment',
    fields: [
      { key: 'courseTitle', label: 'Course Title', format: (e) => plain(e.courseTitle) },
      { key: 'orderId', label: 'Order ID', format: (e) => (e.orderId == null ? '-' : String(e.orderId)) },
      { key: 'orderStatus', label: 'Payment Status', format: (e) => formatEnrollmentOrderStatus(e.orderStatus, e.orderId) },
      { key: 'orderAmount', label: 'Order Amount', format: (e) => formatEnrollmentOrderAmount(e.orderAmount, e.orderCurrency) },
      { key: 'orderCurrency', label: 'Currency', format: (e) => plain(e.orderCurrency) },
      { key: 'orderPaidAt', label: 'Paid At', format: (e) => formatDateLong(e.orderPaidAt) },
      { key: 'orderGatewayRef', label: 'Gateway Reference', format: (e) => plain(e.orderGatewayRef) },
    ],
  },
  {
    id: 'reviewAccess',
    title: 'Review & access',
    fields: [
      { key: 'status', label: 'Enrollment Status', format: (e) => formatEnrollmentStatus(e.status) },
      { key: 'accessStatus', label: 'Access Status', format: (e) => formatEnrollmentAccessStatus(e.accessStatus) },
      { key: 'adminNote', label: 'Admin Note', format: (e) => plain(e.adminNote) },
      { key: 'reviewedBy', label: 'Reviewed By (user ID)', format: (e) => (e.reviewedBy == null ? '-' : String(e.reviewedBy)) },
      { key: 'reviewedAt', label: 'Reviewed At', format: (e) => formatDateLong(e.reviewedAt) },
      { key: 'submittedAt', label: 'Submitted At', format: (e) => formatDateLong(e.submittedAt) },
    ],
  },
  {
    id: 'linkedAccount',
    title: 'Linked account',
    fields: [
      { key: 'userId', label: 'User ID', format: (e) => (e.userId == null ? '-' : String(e.userId)) },
      { key: 'userFullName', label: 'Account Full Name', format: (e) => plain(e.userFullName) },
      { key: 'userEmail', label: 'Account Email', format: (e) => plain(e.userEmail) },
      { key: 'userAccountStatus', label: 'Account Status', format: (e) => formatEnrollmentUserAccountStatus(e.userAccountStatus) },
    ],
  },
];

/** Flat ordered list — useful for Excel detail/batch exporters. */
export const ENROLLMENT_FIELDS_FLAT = ENROLLMENT_FIELD_SECTIONS.flatMap((section) =>
  section.fields.map((field) => ({ ...field, sectionId: section.id, sectionTitle: section.title }))
);

/**
 * Subset of fields rendered as columns in the batch Excel export. Keep ordering
 * scannable (identity → contact → location → academic → payment → review → access).
 */
export const ENROLLMENT_BATCH_EXPORT_COLUMNS = [
  'applicantFullName',
  'fatherName',
  'email',
  'whatsappNumber',
  'dateOfBirth',
  'gender',
  'province',
  'district',
  'city',
  'hsscStatus',
  'board',
  'mdcatAttemptType',
  'courseTitle',
  'orderId',
  'orderStatus',
  'orderAmount',
  'orderCurrency',
  'orderPaidAt',
  'orderGatewayRef',
  'status',
  'accessStatus',
  'adminNote',
  'reviewedBy',
  'reviewedAt',
  'submittedAt',
  'userAccountStatus',
];

/** Build a quick lookup from key → field descriptor (sectionId, label, format). */
const FIELD_BY_KEY = ENROLLMENT_FIELDS_FLAT.reduce((acc, field) => {
  acc[field.key] = field;
  return acc;
}, {});

export function getEnrollmentField(key) {
  return FIELD_BY_KEY[key] || null;
}

export function formatEnrollmentField(key, enrollment) {
  const field = FIELD_BY_KEY[key];
  if (!field) return '-';
  try {
    return field.format(enrollment ?? {});
  } catch {
    return '-';
  }
}

/** Convenience builder used by the batch Excel exporter. */
export function buildBatchExportRowValues(enrollment) {
  return ENROLLMENT_BATCH_EXPORT_COLUMNS.map((key) => formatEnrollmentField(key, enrollment));
}

export function getEnrollmentBatchExportHeaders() {
  return ENROLLMENT_BATCH_EXPORT_COLUMNS.map((key) => FIELD_BY_KEY[key]?.label || key);
}
