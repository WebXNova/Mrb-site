import {
  DEFAULT_MEDIA_STORAGE_PROVIDER,
  MEDIA_STORAGE_PROVIDER_ENV,
} from './mediaStorage.types.js';
import { localQuestionBankStorageProvider } from './localQuestionBankStorage.provider.js';

/** @type {Map<string, import('./mediaStorage.types.js').QuestionBankMediaStorageProvider>} */
const providers = new Map([
  ['local', localQuestionBankStorageProvider],
]);

/**
 * Register a storage provider (e.g. cloud adapter at startup).
 *
 * @param {string} kind
 * @param {import('./mediaStorage.types.js').QuestionBankMediaStorageProvider} provider
 */
export function registerQuestionBankMediaProvider(kind, provider) {
  providers.set(String(kind).trim().toLowerCase(), provider);
}

/**
 * @returns {import('./mediaStorage.types.js').QuestionBankMediaStorageProvider}
 */
export function getQuestionBankMediaStorageProvider() {
  const kind = String(process.env[MEDIA_STORAGE_PROVIDER_ENV] ?? DEFAULT_MEDIA_STORAGE_PROVIDER)
    .trim()
    .toLowerCase();
  const provider = providers.get(kind);
  if (!provider) {
    throw new Error(`Unsupported media storage provider: ${kind}`);
  }
  return provider;
}
