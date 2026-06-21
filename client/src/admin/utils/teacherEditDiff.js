export function normalizeTeacherFormSnapshot(form) {
  if (!form) return null;
  return {
    fullName: String(form.fullName || '').trim(),
    email: String(form.email || '').trim().toLowerCase(),
    username: String(form.username || '').trim().toLowerCase(),
    status: form.status === 'inactive' ? 'inactive' : 'active',
    password: String(form.password || ''),
    assignedSubjects: [...(form.assignedSubjects || [])].map((id) => Number(id)).filter((id) => id > 0).sort((a, b) => a - b),
  };
}

export function hasTeacherFormChanges(form, originalSnapshot) {
  const current = normalizeTeacherFormSnapshot(form);
  if (!current || !originalSnapshot) return false;

  if (current.fullName !== originalSnapshot.fullName) return true;
  if (current.email !== originalSnapshot.email) return true;
  if (current.username !== originalSnapshot.username) return true;
  if (current.status !== originalSnapshot.status) return true;
  if (current.password.trim()) return true;
  if (JSON.stringify(current.assignedSubjects) !== JSON.stringify(originalSnapshot.assignedSubjects)) {
    return true;
  }
  return false;
}

export function buildUpdateTeacherPayload(form) {
  const payload = {
    fullName: String(form.fullName || '').trim(),
    email: String(form.email || '').trim(),
    username: String(form.username || '').trim().toLowerCase(),
    status: form.status === 'inactive' ? 'inactive' : 'active',
    assignedSubjects: [...new Set((form.assignedSubjects || []).map((id) => Number(id)).filter((id) => id > 0))],
  };

  const password = String(form.password || '').trim();
  if (password) {
    payload.password = password;
  }

  if (payload.status === 'inactive') {
    payload.confirmDeactivate = true;
  }

  return payload;
}
