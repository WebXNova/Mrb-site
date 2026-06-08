import { adminApi } from '../../../../api/adminApi.js';
import { validateImageFile } from './validateImageFile.js';
import { validateOptionImageUrl } from './validateOptionImageUrl.js';

/**
 * Upload a validated image file for an MCQ option.
 *
 * Data flow:
 *   File → validateImageFile → upload API → validateOptionImageUrl → return URL
 *
 * Files are never stored in option state — only the returned URL is kept.
 * Backend re-validation is mandatory.
 *
 * @param {File} file
 * @returns {Promise<string>} validated secure URL
 */
export async function uploadOptionImage(file) {
  const fileCheck = await validateImageFile(file);
  if (!fileCheck.ok) {
    const error = new Error(fileCheck.message);
    error.code = fileCheck.code;
    throw error;
  }

  const response = await adminApi.uploadQuestionBankImage(null, file);
  const rawUrl = response?.data?.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Option image upload did not return a URL.');
  }

  const urlCheck = validateOptionImageUrl(rawUrl);
  if (!urlCheck.ok) {
    throw new Error('Upload returned an invalid option image URL.');
  }

  return urlCheck.url;
}
