import multer from 'multer';
import { ApiError } from '../shared/errors/index.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

const storage = multer.memoryStorage();

export const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new ApiError(400, 'FILE_TYPE_NOT_ALLOWED', 'Only JPEG, PNG, WebP and AVIF images are accepted'));
    }
    cb(null, true);
  }
});

export const singleImage = imageUpload.single('image');
export const multipleImages = imageUpload.array('images', 10);
