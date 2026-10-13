import { v2 as cloudinary } from 'cloudinary';

/**
 * Server-side Cloudinary access. The signed-upload flow is wired in
 * Phase 3; for now we just centralize the configuration.
 */
let configured = false;

function ensureConfigured(): typeof cloudinary {
  if (!configured) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

export function getCloudinary(): typeof cloudinary {
  return ensureConfigured();
}

export const CLOUDINARY_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER ?? 'gadget-website';
