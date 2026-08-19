import multer from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new AppError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG and WebP images are supported.'));
      return;
    }
    callback(null, true);
  },
});

export function uploadError(error: unknown, _request: unknown, _response: unknown, next: (error: unknown) => void): void {
  if (error instanceof multer.MulterError) {
    next(new AppError(400, error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD', error.code === 'LIMIT_FILE_SIZE' ? 'Uploaded file exceeds configured size limit.' : 'Invalid multipart upload.'));
    return;
  }
  next(error);
}
