const USERNAME_PATTERN = /^[a-z0-9._]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'letmein1',
  'welcome1',
  'iloveyou1',
]);

export function validatePassword(value, { required = true } = {}) {
  const password = String(value || '');
  if (!password) {
    return required ? 'Please enter a password for this teacher account.' : '';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 128) {
    return 'Password must be 128 characters or fewer.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }
  if (!/\d/.test(password)) {
    return 'Password must include at least one number.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character.';
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too common. Please choose a stronger one.';
  }
  return '';
}

export function validateTeacherForm(values, { mode = 'create' } = {}) {
  const errors = {};
  const fullName = String(values.fullName || '').trim();
  const email = String(values.email || '').trim();
  const username = String(values.username || '').trim().toLowerCase();
  const password = String(values.password || '');
  const assignedSubjects = Array.isArray(values.assignedSubjects) ? values.assignedSubjects : [];

  if (!fullName) {
    errors.fullName = 'Please enter the teacher’s full name.';
  } else if (fullName.length < 2) {
    errors.fullName = 'Full name must be at least 2 characters.';
  } else if (fullName.length > 120) {
    errors.fullName = 'Full name must be 120 characters or fewer.';
  }

  if (!email) {
    errors.email = 'Please enter an email address.';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter a valid email address.';
  } else if (email.length > 255) {
    errors.email = 'Email must be 255 characters or fewer.';
  }

  if (!username) {
    errors.username = 'Please choose a username.';
  } else if (username.length < 3) {
    errors.username = 'Username must be at least 3 characters.';
  } else if (username.length > 50) {
    errors.username = 'Username must be 50 characters or fewer.';
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Username can only use lowercase letters, numbers, dots, and underscores.';
  } else if (username.includes('@')) {
    errors.username = 'Username cannot contain @.';
  } else if (username === 'teacher') {
    errors.username = 'This username is not available.';
  }

  const passwordError = validatePassword(password, { required: mode === 'create' });
  if (passwordError) errors.password = passwordError;

  if (!assignedSubjects.length) {
    errors.assignedSubjects = 'Please assign at least one subject to the teacher.';
  }

  if (values.status !== 'active' && values.status !== 'inactive') {
    errors.status = 'Please choose a valid account status.';
  }

  return errors;
}

export function mapTeacherApiError(err) {
  const message = err?.message || '';
  const code = err?.body?.error?.code || err?.body?.code || '';
  const fieldErrors = err?.body?.error?.details?.fieldErrors || err?.body?.details?.fieldErrors;

  if (code === 'EMAIL_ALREADY_IN_USE') {
    return { email: 'This email is already in use.' };
  }
  if (code === 'USERNAME_ALREADY_IN_USE') {
    return { username: 'This username is already in use.' };
  }
  if (code === 'INVALID_SUBJECT_IDS') {
    return { assignedSubjects: 'One or more selected subjects are not available. Please refresh and try again.' };
  }
  if (code === 'TEACHER_NOT_FOUND') {
    return { form: 'This teacher could not be found. They may have been removed.' };
  }

  if (fieldErrors && typeof fieldErrors === 'object') {
    const mapped = {};
    if (fieldErrors.fullName?.[0]) mapped.fullName = fieldErrors.fullName[0];
    if (fieldErrors.email?.[0]) mapped.email = fieldErrors.email[0];
    if (fieldErrors.username?.[0]) mapped.username = fieldErrors.username[0];
    if (fieldErrors.password?.[0]) mapped.password = fieldErrors.password[0];
    if (fieldErrors.assignedSubjects?.[0]) mapped.assignedSubjects = fieldErrors.assignedSubjects[0];
    if (Object.keys(mapped).length) return mapped;
  }

  if (message) return { form: message };
  return { form: 'Something went wrong. Please try again.' };
}
