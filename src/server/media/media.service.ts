import { BadRequestError } from '@/server/common/errors';
import { CLOUDINARY_FOLDER, getCloudinary } from './cloudinary';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export interface UploadedAsset {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

export const mediaService = {
  async uploadImage(file: File, folderSuffix?: string): Promise<UploadedAsset> {
    if (!file) throw new BadRequestError('No file provided');
    if (file.size > MAX_BYTES) {
      throw new BadRequestError(`File too large. Max size is ${MAX_BYTES / 1024 / 1024} MB.`);
    }
    if (!ALLOWED.has(file.type)) {
      throw new BadRequestError(`Unsupported image type: ${file.type}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const cloudinary = getCloudinary();
    const folder = folderSuffix
      ? `${CLOUDINARY_FOLDER}/${folderSuffix}`
      : CLOUDINARY_FOLDER;

    type RawResult = {
      secure_url: string;
      public_id: string;
      width?: number;
      height?: number;
      format?: string;
      bytes?: number;
    };

    const result = await new Promise<RawResult>((resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ folder, resource_type: 'image' }, (error, uploaded) => {
          if (error || !uploaded) {
            reject(error ?? new Error('Cloudinary returned no result'));
            return;
          }
          resolve(uploaded as RawResult);
        })
        .end(buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  },

  async deleteImage(publicId: string): Promise<void> {
    if (!publicId) throw new BadRequestError('publicId required');
    const cloudinary = getCloudinary();
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary destroy returned ${result.result}`);
    }
  },
};
