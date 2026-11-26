import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/environment.js';

class MemoryStorageProvider {
  constructor() {
    this.objects = new Map();
  }

  async signUpload() {
    return { provider: 'memory', fields: {} };
  }

  async upload(file) {
    const publicId = `memory/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const secureUrl = `https://storage.local/${publicId}`;
    this.objects.set(publicId, { buffer: file?.buffer, secureUrl });
    return {
      provider: 'memory',
      providerPublicId: publicId,
      url: secureUrl,
      secureUrl,
      bytes: file?.size || 0,
      mimeType: file?.mimetype || 'image/jpeg',
      format: (file?.mimetype || 'image/jpeg').split('/')[1]
    };
  }

  async delete(providerPublicId) {
    return this.objects.delete(providerPublicId);
  }

  async getMetadata(providerPublicId) {
    return this.objects.get(providerPublicId) || null;
  }
}

class CloudinaryStorageProvider {
  constructor() {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true
    });
    this.folder = env.CLOUDINARY_FOLDER;
  }

  async signUpload() {
    const timestamp = Math.round(Date.now() / 1000);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder: this.folder }, env.CLOUDINARY_API_SECRET);
    return { provider: 'cloudinary', timestamp, folder: this.folder, signature, cloudName: env.CLOUDINARY_CLOUD_NAME };
  }

  async upload(file) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: this.folder, resource_type: 'auto' },
        (error, uploadResult) => (error ? reject(error) : resolve(uploadResult))
      );
      stream.end(file.buffer);
    });
    return {
      provider: 'cloudinary',
      providerPublicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      bytes: result.bytes,
      mimeType: `${result.resource_type}/${result.format}`,
      format: result.format,
      width: result.width,
      height: result.height
    };
  }

  async delete(providerPublicId) {
    const result = await cloudinary.uploader.destroy(providerPublicId);
    return result.result === 'ok';
  }

  async getMetadata(providerPublicId) {
    return cloudinary.api.resource(providerPublicId);
  }
}

export const storageProvider = env.STORAGE_PROVIDER === 'cloudinary' ? new CloudinaryStorageProvider() : new MemoryStorageProvider();
