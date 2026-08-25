import multer from 'multer';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const error = new Error(
      `Formato no permitido (${file.mimetype}). Solo se admiten imágenes PNG, JPEG o WEBP.`
    );
    error.statusCode = 400;
    cb(error, false);
  }
}

export const uploadSinglePhoto = (fieldName = 'photo') => {
  const upload = multer({
    storage,
    limits: {
      fileSize: MAX_FILE_SIZE_BYTES,
      files: 1,
    },
    fileFilter,
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'El archivo excede el tamaño máximo permitido de 5MB.',
            });
          }
          return res.status(400).json({
            success: false,
            error: `Error al procesar archivo: ${err.message}`,
          });
        }
        return res.status(err.statusCode || 400).json({
          success: false,
          error: err.message || 'Error en la subida de la imagen',
        });
      }
      next();
    });
  };
};

export default {
  uploadSinglePhoto,
};
