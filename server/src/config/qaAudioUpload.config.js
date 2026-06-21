import { env } from './env.js';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_DURATION_SEC = 120;
const DEFAULT_MIN_DURATION_SEC = 1;

/**
 * Q&A voice recording upload limits (student-qa + teacher-qa namespaces).
 */
export function getQaAudioUploadConfig() {
  const maxBytes = env.qaAudioUpload?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxDurationSec = env.qaAudioUpload?.maxDurationSec ?? DEFAULT_MAX_DURATION_SEC;
  const minDurationSec = env.qaAudioUpload?.minDurationSec ?? DEFAULT_MIN_DURATION_SEC;

  return {
    maxBytes,
    maxDurationSec,
    minDurationSec,
    maxSizeLabelMb: Math.round(maxBytes / (1024 * 1024)),
  };
}
