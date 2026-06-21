/**
 * Collect, rewrite, and validate media references in test export/import packages.
 */

import { createHash } from 'crypto';
import {
  TEST_EXPORT_ZIP_IMAGES_PREFIX,
  TEST_EXPORT_ZIP_MANIFEST,
} from '../constants/testRichContent.constants.js';
import { resolveQuestionBankFilenameFromUrl } from '../storage/localQuestionBankStorage.provider.js';

const UPLOAD_URL_PATTERN = /^\/api\/uploads\/question-bank\/[a-f0-9]{48}\.(jpg|png|webp)$/i;
const ARCHIVE_PATH_PATTERN = /^images\/[a-f0-9]{48}\.(jpg|png|webp)$/i;
const HTTP_URL_PATTERN = /^https?:\/\/.+/i;
const IMG_SRC_PATTERN = /<img\b[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;

/**
 * @param {string} html
 * @returns {string[]}
 */
export function extractImgSrcFromHtml(html) {
  const srcs = [];
  const text = String(html ?? '');
  if (!text) return srcs;
  let match;
  const re = new RegExp(IMG_SRC_PATTERN.source, IMG_SRC_PATTERN.flags);
  while ((match = re.exec(text)) !== null) {
    const src = String(match[1] ?? '').trim();
    if (src) srcs.push(src);
  }
  return srcs;
}

/**
 * @param {string} url
 */
function classifyMediaUrl(url) {
  const trimmed = String(url ?? '').trim();
  if (!trimmed) return { kind: 'empty' };
  if (ARCHIVE_PATH_PATTERN.test(trimmed)) {
    return { kind: 'archive', url: trimmed, archivePath: trimmed };
  }
  if (UPLOAD_URL_PATTERN.test(trimmed)) {
    const filename = resolveQuestionBankFilenameFromUrl(trimmed);
    return {
      kind: 'upload',
      url: trimmed,
      filename,
      archivePath: filename ? `${TEST_EXPORT_ZIP_IMAGES_PREFIX}${filename}` : null,
    };
  }
  if (HTTP_URL_PATTERN.test(trimmed)) {
    return { kind: 'external', url: trimmed };
  }
  return { kind: 'broken', url: trimmed };
}

/**
 * @param {string} value
 * @param {Map<string, string>} replacements
 */
function replaceUrlsInString(value, replacements) {
  if (value == null || String(value).trim() === '') return value;
  let next = String(value);
  for (const [from, to] of replacements.entries()) {
    if (from && to && from !== to) {
      next = next.split(from).join(to);
    }
  }
  return next;
}

/**
 * Collect unique media references from an export document.
 *
 * @param {Record<string, unknown>} document
 */
export function collectTestExportMediaRefs(document) {
  /** @type {Map<string, { originalUrl: string, archivePath: string|null, external: boolean, broken: boolean, sources: Set<string> }>} */
  const refs = new Map();

  function addRef(url, source) {
    const classified = classifyMediaUrl(url);
    if (classified.kind === 'empty') return;

    if (classified.kind === 'broken') {
      const key = `broken:${classified.url}`;
      if (!refs.has(key)) {
        refs.set(key, {
          originalUrl: classified.url,
          archivePath: null,
          external: false,
          broken: true,
          sources: new Set([source]),
        });
      } else {
        refs.get(key).sources.add(source);
      }
      return;
    }

    if (classified.kind === 'external') {
      const key = `external:${classified.url}`;
      if (!refs.has(key)) {
        refs.set(key, {
          originalUrl: classified.url,
          archivePath: null,
          external: true,
          broken: false,
          sources: new Set([source]),
        });
      } else {
        refs.get(key).sources.add(source);
      }
      return;
    }

    const archivePath = classified.archivePath;
    if (!archivePath) return;

    if (!refs.has(archivePath)) {
      refs.set(archivePath, {
        originalUrl: classified.url,
        archivePath,
        external: false,
        broken: false,
        sources: new Set([source]),
      });
    } else {
      refs.get(archivePath).sources.add(source);
    }
  }

  const questions = Array.isArray(document?.questions) ? document.questions : [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    const qLabel = `question:${i + 1}`;

    addRef(q.question_image_url, `${qLabel}:question_image_url`);
    for (const src of extractImgSrcFromHtml(q.question_html)) addRef(src, `${qLabel}:question_html`);
    for (const src of extractImgSrcFromHtml(q.explanation_html)) addRef(src, `${qLabel}:explanation_html`);

    const options = Array.isArray(q.options) ? q.options : [];
    for (let oi = 0; oi < options.length; oi += 1) {
      const opt = options[oi];
      addRef(opt.image_url, `${qLabel}:option:${opt.option_key ?? oi}:image_url`);
      for (const src of extractImgSrcFromHtml(opt.option_html)) {
        addRef(src, `${qLabel}:option:${opt.option_key ?? oi}:option_html`);
      }
    }
  }

  return refs;
}

/**
 * Rewrite upload URLs in document to archive-relative paths and attach media manifest.
 *
 * @param {Record<string, unknown>} document
 * @param {Map<string, { originalUrl: string, archivePath: string, sha256: string, content_type: string }>} bundledMedia
 */
export function attachMediaBundleToExportDocument(document, bundledMedia) {
  /** @type {Map<string, string>} */
  const replacements = new Map();
  for (const entry of bundledMedia.values()) {
    replacements.set(entry.originalUrl, entry.archivePath);
  }

  const questions = (Array.isArray(document.questions) ? document.questions : []).map((q) => {
    const options = (Array.isArray(q.options) ? q.options : []).map((opt) => ({
      ...opt,
      image_url: opt.image_url == null ? null : replaceUrlsInString(opt.image_url, replacements),
      option_html: replaceUrlsInString(opt.option_html, replacements),
      option_text: replaceUrlsInString(opt.option_text, replacements),
    }));

    return {
      ...q,
      question_image_url:
        q.question_image_url == null ? null : replaceUrlsInString(q.question_image_url, replacements),
      question_html: replaceUrlsInString(q.question_html, replacements),
      question_text: replaceUrlsInString(q.question_text, replacements),
      explanation_html: replaceUrlsInString(q.explanation_html, replacements),
      explanation: replaceUrlsInString(q.explanation, replacements),
      options,
    };
  });

  const mediaManifest = [...bundledMedia.values()].map((entry) => ({
    path: entry.archivePath,
    original_url: entry.originalUrl,
    sha256: entry.sha256,
    content_type: entry.content_type,
  }));

  const externalRefs = [...collectTestExportMediaRefs(document).values()].filter((r) => r.external);

  return {
    ...document,
    questions,
    media_bundle: true,
    media: mediaManifest,
    media_warnings: externalRefs.map((ref) => ({
      code: 'EXTERNAL_MEDIA_NOT_BUNDLED',
      url: ref.originalUrl,
      message: `External image URL was not bundled: ${ref.originalUrl}`,
    })),
  };
}

/**
 * Rewrite archive paths / original URLs to stored URLs in import package.
 *
 * @param {Record<string, unknown>} pkg
 * @param {Map<string, string>} urlMap — from archive path or original URL → new upload URL
 */
export function rewriteImportPackageMediaUrls(pkg, urlMap) {
  /** @type {Map<string, string>} */
  const replacements = urlMap;

  const questions = (Array.isArray(pkg.questions) ? pkg.questions : []).map((q) => {
    const options = (Array.isArray(q.options) ? q.options : []).map((opt) => ({
      ...opt,
      image_url: opt.image_url == null ? null : replaceUrlsInString(opt.image_url, replacements),
      option_html: replaceUrlsInString(opt.option_html, replacements),
      option_text: replaceUrlsInString(opt.option_text, replacements),
    }));

    return {
      ...q,
      question_image_url:
        q.question_image_url == null ? null : replaceUrlsInString(q.question_image_url, replacements),
      question_html: replaceUrlsInString(q.question_html, replacements),
      question_text: replaceUrlsInString(q.question_text, replacements),
      explanation_html: replaceUrlsInString(q.explanation_html, replacements),
      explanation: replaceUrlsInString(q.explanation, replacements),
      options,
    };
  });

  const next = { ...pkg, questions };
  delete next.media;
  delete next.media_bundle;
  delete next.media_warnings;
  return next;
}

/**
 * @param {Buffer} buffer
 */
export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * @param {string} archivePath
 */
export function isSafeZipImageEntryPath(archivePath) {
  const normalized = String(archivePath ?? '').replace(/\\/g, '/');
  if (!normalized.startsWith(TEST_EXPORT_ZIP_IMAGES_PREFIX)) return false;
  if (normalized.includes('..')) return false;
  const base = normalized.slice(TEST_EXPORT_ZIP_IMAGES_PREFIX.length);
  return /^[a-f0-9]{48}\.(jpg|png|webp)$/i.test(base);
}

/**
 * @param {string} entryPath
 */
export function isSafeZipManifestPath(entryPath) {
  return String(entryPath ?? '').replace(/\\/g, '/') === TEST_EXPORT_ZIP_MANIFEST;
}
