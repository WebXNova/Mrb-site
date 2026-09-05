import sharp from 'sharp';

export const MAX_RASTER_IMAGE_WIDTH = 4096;
export const MAX_RASTER_IMAGE_HEIGHT = 4096;
/** Pixel-bomb guard: width × height must not exceed this (default 4096×4096). */
export const MAX_RASTER_IMAGE_PIXELS = MAX_RASTER_IMAGE_WIDTH * MAX_RASTER_IMAGE_HEIGHT;

/** Cap native Sharp thread pool so admin/student uploads cannot starve the event loop. */
export const SHARP_LIB_CONCURRENCY = 1;
/** Process-wide in-flight reencode limit (student + teacher + admin share one API process). */
export const SHARP_MAX_IN_FLIGHT = 2;
/**
 * Max wait for a Sharp slot. Keep below typical student upload client timeouts (60s)
 * so contention fails deterministically instead of hanging until the browser aborts.
 */
export const SHARP_SLOT_WAIT_MS = 45_000;

const JPEG_QUALITY = 72;
const WEBP_QUALITY = 72;
const PNG_COMPRESSION_LEVEL = 3;

try {
  sharp.concurrency(SHARP_LIB_CONCURRENCY);
} catch {
  /* ignore — older sharp builds */
}

let sharpInFlight = 0;
/** @type {Array<() => void>} */
const sharpWaiters = [];

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withSharpSlot(fn) {
  if (sharpInFlight >= SHARP_MAX_IN_FLIGHT) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = sharpWaiters.indexOf(entry);
        if (idx >= 0) sharpWaiters.splice(idx, 1);
        reject(
          Object.assign(new Error('Image processing is busy. Please try again shortly.'), {
            code: 'SHARP_BUSY',
          })
        );
      }, SHARP_SLOT_WAIT_MS);
      const entry = () => {
        clearTimeout(timer);
        resolve();
      };
      sharpWaiters.push(entry);
    });
  }
  sharpInFlight += 1;
  try {
    return await fn();
  } finally {
    sharpInFlight -= 1;
    const next = sharpWaiters.shift();
    if (next) next();
  }
}

/**
 * Decode, validate dimensions, strip metadata, and re-encode a raster upload.
 *
 * @param {string} filePath
 * @param {'jpeg'|'png'|'webp'} kind
 * @returns {Promise<Buffer>}
 */
export async function reencodeValidatedRasterImage(filePath, kind) {
  return withSharpSlot(async () => {
    const pipeline = sharp(filePath, {
      failOn: 'error',
      animated: false,
      limitInputPixels: MAX_RASTER_IMAGE_PIXELS,
    }).rotate();

    let metadata;
    try {
      metadata = await pipeline.metadata();
    } catch (error) {
      throw Object.assign(new Error('File content is not a supported image format.'), {
        code: 'INVALID_IMAGE_DECODE',
        cause: error,
      });
    }

    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      width > MAX_RASTER_IMAGE_WIDTH ||
      height > MAX_RASTER_IMAGE_HEIGHT ||
      width * height > MAX_RASTER_IMAGE_PIXELS
    ) {
      throw Object.assign(
        new Error(
          `Image dimensions exceed allowed limits (max ${MAX_RASTER_IMAGE_WIDTH}×${MAX_RASTER_IMAGE_HEIGHT}, ${MAX_RASTER_IMAGE_PIXELS} pixels).`
        ),
        {
          code: 'IMAGE_DIMENSIONS_EXCEEDED',
          width,
          height,
        }
      );
    }

    try {
      if (kind === 'jpeg') {
        return pipeline
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: false, force: true })
          .withMetadata({ exif: undefined, icc: undefined })
          .toBuffer();
      }
      if (kind === 'png') {
        return pipeline
          .png({ compressionLevel: PNG_COMPRESSION_LEVEL, force: true })
          .withMetadata({ exif: undefined, icc: undefined })
          .toBuffer();
      }
      if (kind === 'webp') {
        return pipeline
          .webp({ quality: WEBP_QUALITY, force: true })
          .withMetadata({ exif: undefined, icc: undefined })
          .toBuffer();
      }
      throw Object.assign(new Error('Unsupported image kind.'), { code: 'INVALID_KIND' });
    } catch (error) {
      if (error?.code === 'INVALID_KIND' || error?.code === 'IMAGE_DIMENSIONS_EXCEEDED') {
        throw error;
      }
      throw Object.assign(new Error('File content is not a supported image format.'), {
        code: 'INVALID_IMAGE_REENCODE',
        cause: error,
      });
    }
  });
}
