import { adminApi } from '../../../../api/adminApi.js';
import { validateImageFile } from './validateImageFile.js';
import { validateImageUrl } from './validateImageUrl.js';

/**
 * Upload a validated image file to the Question Bank API.
 * Files are never stored directly in state — only the returned URL is kept.
 * Backend re-validation is mandatory.
 *
 * @param {File} file
 * @returns {Promise<string>} validated secure URL
 */
export async function uploadImage(file) {
  const fileCheck = await validateImageFile(file);
  if (!fileCheck.ok) {
    const error = new Error(fileCheck.message);
    error.code = fileCheck.code;
    throw error;
  }

  const response = await adminApi.uploadQuestionBankImage(null, file);
  const rawUrl = response?.data?.url;

  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Image upload did not return a URL.');
  }

  const urlCheck = validateImageUrl(rawUrl);
  if (!urlCheck.ok) {
    throw new Error('Upload returned an invalid image URL.');
  }

  return urlCheck.url;
}
