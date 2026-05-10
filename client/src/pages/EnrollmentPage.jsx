import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import Button from '../components/ui/Button';
import { studentApi } from '../api/studentApi';
import { ENROLLMENT_BATCH_OPTIONS } from '../constants/enrollmentBatches';
import './EnrollmentPage.css';

const PROVINCES = [
  'Sindh',
  'Punjab',
  'KPK',
  'Balochistan',
  'Gilgit Baltistan',
  'Azad Jammu & Kashmir',
  'Islamabad Capital Territory',
];

const SINDH_DISTRICTS = [
  'Larkana',
  'Badin',
  'Dadu',
  'Ghotki',
  'Hyderabad',
  'Jacobabad',
  'Jamshoro',
  'Karachi Central',
  'Karachi East',
  'Karachi',
  'Korangi',
  'Karachi Malir',
  'Karachi South',
  'Karachi West',
  'Kashmore Kandhkot',
  'Other',
];

const BOARDS = [
  'BISE Karachi',
  'BISE Hyderabad',
  'BISE Sukkur',
  'BISE Larkana',
  'BISE Mirpur Khas',
  'BISE Nawab Shah',
  'Cambridge',
  'Other',
];

const HSSC_OPTIONS = ['Inter Class', 'First Year Class', 'Matric Class'];
const ATTEMPT_TYPES = ['Fresher', 'Improver'];

const ACCEPTED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024;

const INITIAL_FORM = {
  email: '',
  applicantFullName: '',
  fatherName: '',
  dateOfBirth: '',
  gender: 'male',
  whatsappNumber: '',
  province: '',
  district: '',
  hsscStatus: '',
  board: '',
  mdcatAttemptType: 'Fresher',
  transactionId: '',
};

function normalizePakistaniNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('92')) return `+${digits}`;
  if (digits.startsWith('0')) return `+92${digits.slice(1)}`;
  if (digits.startsWith('3')) return `+92${digits}`;
  return `+${digits}`;
}

/** Same rule as normalized payload sent to API: +923 + 9 digits (after the leading 3). */
function isValidPakistaniWhatsappNormalized(value) {
  return /^\+923[0-9]{9}$/.test(String(value || ''));
}

function validateForm(form) {
  const errors = {};
  if (!form.email.trim()) errors.email = 'Email is required';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
  if (!form.applicantFullName.trim()) errors.applicantFullName = "Applicant's full name is required";
  if (!form.fatherName.trim()) errors.fatherName = "Father's name is required";
  if (!String(form.whatsappNumber || '').trim()) errors.whatsappNumber = 'WhatsApp number is required';
  else {
    const whatsappNormalized = normalizePakistaniNumber(form.whatsappNumber);
    if (!isValidPakistaniWhatsappNormalized(whatsappNormalized)) {
      errors.whatsappNumber = 'Enter a valid Pakistan WhatsApp number';
    }
  }
  if (!form.province.trim()) errors.province = 'Province is required';
  if (!form.district.trim()) errors.district = 'District is required';
  if (!form.hsscStatus) errors.hsscStatus = 'Please select your HSSC status';
  if (!form.board.trim()) errors.board = 'Board is required';
  if (!form.mdcatAttemptType) errors.mdcatAttemptType = 'Select MDCAT attempt history';
  return errors;
}

function validatePaymentStep(form) {
  const errors = {};
  if (!form.transactionId.trim()) errors.transactionId = 'Transaction ID is required';
  return errors;
}

function ReceiptPreview({ file, previewUrl }) {
  if (!file) return null;
  if (file.type === 'application/pdf') {
    return (
      <div className="enrollment-receipt-preview enrollment-receipt-preview--pdf">
        <span className="enrollment-receipt-preview__icon">PDF</span>
        <p>{file.name}</p>
      </div>
    );
  }
  return (
    <div className="enrollment-receipt-preview">
      <img src={previewUrl} alt="Receipt preview" />
      <p>{file.name}</p>
    </div>
  );
}

export default function EnrollmentPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [dragActive, setDragActive] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const districtOptions = useMemo(() => {
    if (form.province === 'Sindh') return SINDH_DISTRICTS;
    return form.province ? ['Other'] : [];
  }, [form.province]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function handleNext() {
    const nextErrors = validateForm(form);
    setErrors(nextErrors);
    setSubmitError('');
    if (Object.keys(nextErrors).length > 0) return;
    setStep(2);
  }

  function handleReceiptSelect(file) {
    if (!file) return;
    if (!ACCEPTED_RECEIPT_TYPES.includes(file.type)) {
      setSubmitError('Please upload JPG, PNG, WEBP image or PDF receipt');
      return;
    }
    if (file.size > MAX_RECEIPT_SIZE_BYTES) {
      setSubmitError('Receipt file must be 8 MB or smaller');
      return;
    }
    setSubmitError('');
    setReceiptFile(file);
    if (file.type === 'application/pdf') {
      setReceiptPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setReceiptPreview(url);
  }

  function onDrop(event) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    handleReceiptSelect(file);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const detailErrors = validateForm(form);
    const paymentErrors = validatePaymentStep(form);
    const merged = { ...detailErrors, ...paymentErrors };
    setErrors(merged);
    setSubmitError('');

    if (!receiptFile) {
      setSubmitError('Please upload your fee receipt before submitting.');
      return;
    }

    if (Object.keys(merged).length > 0) {
      if (Object.keys(detailErrors).length > 0) {
        setStep(1);
        setSubmitError('Please fix Step 1 (highlighted fields), then complete payment again.');
      } else {
        setSubmitError('Please fix the highlighted fields.');
      }
      return;
    }

    setIsSubmitting(true);
    setUploadProgress(0);
    setSubmitError('');

    try {
      const res = await studentApi.submitEnrollment(
        {
          ...form,
          whatsappNumber: normalizePakistaniNumber(form.whatsappNumber),
          receipt: receiptFile,
        },
        { onProgress: setUploadProgress }
      );
      const payload = res?.data;
      const verificationToken =
        payload?.verificationToken ?? payload?.verification_token ?? '';
      if (!verificationToken) {
        throw new Error('Your submission was received but no tracking reference was returned. Please contact support.');
      }
      setForm(INITIAL_FORM);
      setReceiptFile(null);
      setReceiptPreview('');
      setStep(1);
      setUploadProgress(0);
      navigate(`/enrollment/status?token=${encodeURIComponent(verificationToken)}`, { replace: true });
    } catch (error) {
      setSubmitError(error.message || 'Failed to submit enrollment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageLayout>
      <section className="enrollment-shell">
        <div className="enrollment-card">
          <header className="enrollment-header">
            <p className="enrollment-step">Step {step} of 2</p>
            <h1 className="heading-2">Student Registration Form</h1>
            <p className="enrollment-subtitle">Fill in your academic and personal details carefully.</p>
          </header>

          {step === 1 ? (
            <form className="enrollment-form" onSubmit={(event) => event.preventDefault()}>
              <div className="enrollment-grid">
                <Field label="Email Address" required error={errors.email}>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(event) => updateField('email', event.target.value)}
                    placeholder="name@example.com"
                  />
                </Field>

                <Field label="Applicant’s Full Name" required error={errors.applicantFullName}>
                  <input
                    value={form.applicantFullName}
                    onChange={(event) => updateField('applicantFullName', event.target.value)}
                    placeholder="Your full name"
                  />
                </Field>

                <Field label="Father’s Name" required error={errors.fatherName}>
                  <input
                    value={form.fatherName}
                    onChange={(event) => updateField('fatherName', event.target.value)}
                    placeholder="Father name"
                  />
                </Field>

                <Field label="Date of Birth">
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(event) => updateField('dateOfBirth', event.target.value)}
                  />
                </Field>

                <Field label="Gender" required error={errors.gender}>
                  <div className="enrollment-radio-row">
                    {['male', 'female'].map((gender) => (
                      <label key={gender} className="enrollment-radio-chip">
                        <input
                          type="radio"
                          checked={form.gender === gender}
                          onChange={() => updateField('gender', gender)}
                        />
                        <span>{gender === 'male' ? 'Male' : 'Female'}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                <Field label="WhatsApp Number" required error={errors.whatsappNumber}>
                  <input
                    value={form.whatsappNumber}
                    onChange={(event) => updateField('whatsappNumber', event.target.value)}
                    placeholder="+92 3xx xxxxxxx"
                  />
                </Field>

                <Field label="Province" required error={errors.province}>
                  <input
                    list="province-options"
                    value={form.province}
                    onChange={(event) => {
                      updateField('province', event.target.value);
                      updateField('district', '');
                    }}
                    placeholder="Select province"
                  />
                  <datalist id="province-options">
                    {PROVINCES.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </Field>

                <Field label="District" required error={errors.district}>
                  <select
                    value={form.district}
                    onChange={(event) => updateField('district', event.target.value)}
                    disabled={!form.province}
                  >
                    <option value="">{form.province ? 'Select district' : 'Select province first'}</option>
                    {districtOptions.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Intermediate / HSSC Status" required error={errors.hsscStatus}>
                  <select value={form.hsscStatus} onChange={(event) => updateField('hsscStatus', event.target.value)}>
                    <option value="">Select status</option>
                    {HSSC_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Batch Number" required error={errors.batchNumber}>
                  <select value={form.batchNumber} onChange={(event) => updateField('batchNumber', event.target.value)}>
                    <option value="">Select batch</option>
                    {ENROLLMENT_BATCH_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Pre-Medical Intermediate Board" required error={errors.board}>
                  <input
                    list="board-options"
                    value={form.board}
                    onChange={(event) => updateField('board', event.target.value)}
                    placeholder="Choose board"
                  />
                  <datalist id="board-options">
                    {BOARDS.map((item) => (
                      <option key={item} value={item} />
                    ))}
                  </datalist>
                </Field>
              </div>

              <Field label="MDCAT Attempt History" required error={errors.mdcatAttemptType}>
                <div className="enrollment-attempt-grid">
                  {ATTEMPT_TYPES.map((item) => (
                    <label
                      key={item}
                      className={`enrollment-attempt-card ${
                        form.mdcatAttemptType === item ? 'enrollment-attempt-card--active' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        checked={form.mdcatAttemptType === item}
                        onChange={() => updateField('mdcatAttemptType', item)}
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </Field>

              <div className="enrollment-actions">
                <Button type="button" variant="secondary" size="md" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
                <Button type="button" variant="accent" size="md" onClick={handleNext}>
                  Next
                </Button>
              </div>
            </form>
          ) : (
            <form className="enrollment-payment" onSubmit={handleSubmit}>
              <article className="enrollment-fee-card">
                <h2 className="heading-3">Fee Details</h2>
                <p className="enrollment-fee-title">Total Fees for the Whole Year Session</p>
                <p className="enrollment-fee-amount">RS: 1999</p>
                <p className="enrollment-fee-methods">Payment Method: EasyPaisa and JazzCash</p>
                <div className="enrollment-method-logos">
                  <span className="enrollment-method-brand">
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/9/9c/Easypaisa_Digital_Bank_logo.png"
                      alt="EasyPaisa logo"
                      width={180}
                      height={50}
                      loading="lazy"
                    />
                  </span>
                  <span className="enrollment-method-brand">
                    <img
                      src="https://upload.wikimedia.org/wikipedia/ur/b/b4/JazzCash_logo.png"
                      alt="JazzCash logo"
                      width={160}
                      height={50}
                      loading="lazy"
                    />
                  </span>
                </div>
                <p className="enrollment-account-number">
                  Account Number: <strong dir="ltr">03141227364</strong>
                </p>
                <p className="enrollment-account-title">
                  Account Title: <strong>Muzamil Raheem</strong>
                </p>
              </article>

              <article className="enrollment-warning">
                <strong>Warning:</strong> If your fee receipt is found fake, bogus, or submitted through any unethical
                method, then MRB Classes reserves the right to take legal and moral action against you. You may also
                be permanently blocked from MRB Classes.
              </article>

              <Field label="Transaction ID" required error={errors.transactionId}>
                <input
                  value={form.transactionId}
                  onChange={(event) => updateField('transactionId', event.target.value)}
                  placeholder="Enter transaction ID"
                />
              </Field>

              <section
                className={`enrollment-upload ${dragActive ? 'enrollment-upload--active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={onDrop}
              >
                <h3>Upload Your Fee Receipt Here With Full Transaction ID and Details</h3>
                <p>Drag and drop receipt file here, or choose from your device.</p>
                <input
                  id="receipt-input"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf"
                  onChange={(event) => handleReceiptSelect(event.target.files?.[0])}
                />
                <label htmlFor="receipt-input" className="enrollment-upload__pick">
                  Choose Receipt File
                </label>
                <small>Accepted: JPG, PNG, WEBP, PDF | Max size: 8 MB</small>
              </section>

              <ReceiptPreview file={receiptFile} previewUrl={receiptPreview} />

              {isSubmitting || uploadProgress > 0 ? (
                <div className="enrollment-progress-wrap" aria-live="polite">
                  <div className="enrollment-progress" style={{ width: `${uploadProgress}%` }} />
                  <span>{uploadProgress}% uploaded</span>
                </div>
              ) : null}

              {submitError ? <p className="enrollment-error">{submitError}</p> : null}

              <div className="enrollment-actions">
                <Button type="button" variant="secondary" size="md" onClick={() => setStep(1)} disabled={isSubmitting}>
                  Back
                </Button>
                <Button type="submit" variant="accent" size="md" disabled={isSubmitting}>
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </section>
    </PageLayout>
  );
}

function Field({ label, required = false, error = '', children }) {
  return (
    <div className="enrollment-field">
      <label>
        {label} {required ? <span>*</span> : null}
      </label>
      {children}
      {error ? <p className="enrollment-field__error">{error}</p> : null}
    </div>
  );
}
