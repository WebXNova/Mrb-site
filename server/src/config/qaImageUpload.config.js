import { env } from './env.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Q&A raster image upload limits (student-qa + teacher-qa namespaces).
 * Override via QA_IMAGE_UPLOAD_* env vars in production.
 */
export function getQaImageUploadConfig() {
  const maxBytes = env.qaUpload?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxWidth = env.qaUpload?.maxWidth ?? 8000;
  const maxHeight = env.qaUpload?.maxHeight ?? 8000;
  const maxPixels = env.qaUpload?.maxPixels ?? 64_000_000;

  return {
    maxBytes,
    maxWidth,
    maxHeight,
    maxPixels,
    reencodeLimits: { maxWidth, maxHeight, maxPixels },
    maxSizeLabelMb: Math.round(maxBytes / (1024 * 1024)),
  };
}
