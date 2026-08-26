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
    fileSize: 15 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const validMime = file.mimetype === "application/pdf";
    const validExtension = extension === ".pdf";

    if (!validMime || !validExtension) {
      return cb(new Error("Only PDF files are allowed."));
    }

    cb(null, true);
  }
});

function ensureCloudinaryConfigured() {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error("Cloudinary environment variables are not configured.");
  }
}

function uploadPdfBuffer(buffer) {
  ensureCloudinaryConfigured();

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
  deleteCloudFile
};
