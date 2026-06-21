import sharp from 'sharp';

export const MAX_RASTER_IMAGE_WIDTH = 8000;
export const MAX_RASTER_IMAGE_HEIGHT = 8000;
/** Pixel-bomb guard: width × height must not exceed this (default 8000×8000). */
export const MAX_RASTER_IMAGE_PIXELS = MAX_RASTER_IMAGE_WIDTH * MAX_RASTER_IMAGE_HEIGHT;

const JPEG_QUALITY = 90;
const WEBP_QUALITY = 90;

/**
 * Decode, validate dimensions, strip metadata, and re-encode a raster upload.
 *
 * @param {string} filePath
 * @param {'jpeg'|'png'|'webp'} kind
 * @returns {Promise<Buffer>}
 */
export async function reencodeValidatedRasterImage(filePath, kind) {
  const pipeline = sharp(filePath, { failOn: 'error', animated: false }).rotate();

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
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, force: true })
        .withMetadata({ exif: undefined, icc: undefined })
        .toBuffer();
    }
    if (kind === 'png') {
      return pipeline
        .png({ compressionLevel: 9, force: true })
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
}
