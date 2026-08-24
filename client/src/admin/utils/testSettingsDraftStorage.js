export const SETTINGS_DRAFT_STORAGE_VERSION = 1;
export const SETTINGS_LOCAL_DEBOUNCE_MS = 400;
export const SETTINGS_SERVER_DEBOUNCE_MS = 2000;

export function getTestSettingsDraftStorageKey(testId) {
  return `test-settings-draft:${String(testId || '')}`;
}

export function fingerprintSettingsForm(form) {
  try {
    return JSON.stringify(form ?? {});
  } catch {
    return '';
  }
}

export function readTestSettingsDraft(testId) {
  if (!testId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(getTestSettingsDraftStorageKey(testId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.form) return null;
    if (Number(parsed.version) !== SETTINGS_DRAFT_STORAGE_VERSION) return null;
    return {
      form: parsed.form,
      fingerprint: typeof parsed.fingerprint === 'string' ? parsed.fingerprint : fingerprintSettingsForm(parsed.form),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      syncState: parsed.syncState === 'pending' ? 'pending' : 'synced',
    };
  } catch {
    return null;
  }
}

export function writeTestSettingsDraft(testId, form, syncState = 'pending') {
  if (!testId || typeof localStorage === 'undefined') return null;
  const savedAt = new Date().toISOString();
  const record = {
    version: SETTINGS_DRAFT_STORAGE_VERSION,
    form,
    fingerprint: fingerprintSettingsForm(form),
    savedAt,
    syncState,
  };
  localStorage.setItem(getTestSettingsDraftStorageKey(testId), JSON.stringify(record));
  return savedAt;
}

export function clearTestSettingsDraft(testId) {
  if (!testId || typeof localStorage === 'undefined') return;
  localStorage.removeItem(getTestSettingsDraftStorageKey(testId));
}
