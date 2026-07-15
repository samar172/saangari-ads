const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a multer file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer from multer memoryStorage
 * @param {string} folder - Folder name in Cloudinary
 * @returns {Promise<string>} - The secure URL of the uploaded image
 */
function uploadToCloudinary(buffer, folder = 'saangri') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary by URL
 * @param {string} url - The Cloudinary secure_url
 */
function deleteFromCloudinary(url) {
  return new Promise((resolve, reject) => {
    try {
      // Extract public ID from URL: e.g. https://res.cloudinary.com/demo/image/upload/v123456/saangri/xyz.jpg -> saangri/xyz
      const parts = url.split('/');
      const filename = parts.pop();
      const folder = parts.pop();
      const publicId = `${folder}/${filename.split('.')[0]}`;

      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    } catch (e) {
      resolve(); // ignore parse errors on old local paths
    }
  });
}

module.exports = {
  uploadToCloudinary,
  deleteFromCloudinary
};
