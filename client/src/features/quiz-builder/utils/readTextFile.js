/** Max bytes — aligned with server Aiken payload cap (1 MB). */
export const AIKEN_IMPORT_MAX_FILE_BYTES = 1_000_000;

export const AIKEN_IMPORT_ACCEPT =
  '.txt,.aiken,text/plain,application/octet-stream';

const ALLOWED_EXTENSIONS = new Set(['.txt', '.aiken']);

/**
 * @param {File} file
 */
export function validateAikenImportFile(file) {
  if (!(file instanceof File)) {
    return 'Please choose an Aiken file to load.';
  }

  if (file.size === 0) {
    return 'The selected file is empty.';
  }

  if (file.size > AIKEN_IMPORT_MAX_FILE_BYTES) {
    return 'File is too large. Maximum size is 1 MB.';
  }

  const name = String(file.name ?? '').toLowerCase();
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const mime = String(file.type ?? '').toLowerCase();

  const extensionOk = Boolean(extension && ALLOWED_EXTENSIONS.has(extension));
  const mimeOk = mime === 'text/plain';

  if (!extensionOk && !mimeOk) {
    return 'Only .txt or .aiken files are supported.';
  }

  return null;
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsText(file, 'UTF-8');
  });
}
