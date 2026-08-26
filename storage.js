const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const path = require("path");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (
      file.mimetype !== "application/pdf" ||
      extension !== ".pdf"
    ) {
      return cb(new Error("Only PDF files are allowed."));
    }

    cb(null, true);
  }
});

function hasPdfSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function ensureCloudinaryConfigured() {
  const required = [
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET"
  ];

  if (required.some(name => !process.env[name])) {
    throw new Error("Cloud file storage is not configured.");
  }
}

function uploadPdfBuffer(buffer) {
  ensureCloudinaryConfigured();

  if (!hasPdfSignature(buffer)) {
    throw new Error("Invalid PDF file.");
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "raw",
        folder: "dcurs/documents",
        unique_filename: true,
        overwrite: false
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

async function deleteCloudFile(publicId) {
  if (!publicId) return;

  ensureCloudinaryConfigured();

  await cloudinary.uploader.destroy(publicId, {
    resource_type: "raw",
    invalidate: true
  });
}

module.exports = {
  upload,
  uploadPdfBuffer,
  deleteCloudFile,
  hasPdfSignature
};
