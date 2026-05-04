import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/apiError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads/student-qa');

const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const extRaw = path.extname(file.originalname || '').toLowerCase();
    const ext = allowedExt.has(extRaw) ? extRaw : '.jpg';
    const name = `${req.user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!/^(image\/(jpeg|png|gif|webp))$/i.test(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
});

function handleUpload(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (err && err.name === 'MulterError') {
      next(new ApiError(400, err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : err.message));
      return;
    }
    if (err) {
      next(err instanceof ApiError ? err : new ApiError(400, err.message || 'Upload failed'));
      return;
    }
    next();
  });
}

export const postStudentQuestionAttachment = [
  handleUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new ApiError(400, 'No image file uploaded');
    }
    const url = `/api/uploads/student-qa/${req.file.filename}`;
    res.json({ success: true, data: { url } });
  }),
];
