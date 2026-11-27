import mongoose from 'mongoose';
import { appConfig } from '../../config/appConfig.js';
import { MEDIA_RESOURCE_TYPES } from '../../shared/constants/index.js';
import { badRequest, conflict, invalidState, notFound } from '../../shared/errors/index.js';
import { storageProvider } from '../../infrastructure/storage/index.js';
import { jobQueue } from '../../infrastructure/jobs/index.js';
import { Media } from './media.model.js';

function normalizeAttachedTo(attachedTo) {
  const type = attachedTo?.type;
  const id = attachedTo?.id;
  if (!['property', 'user'].includes(type) || !mongoose.Types.ObjectId.isValid(id)) {
    throw badRequest('A valid attachment target is required');
  }
  return {
    type,
    id: id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))
  };
}

function actorIdFrom(actor) {
  const value = actor?._id || actor?.userId || actor?.actorId || actor;
  if (!mongoose.Types.ObjectId.isValid(value)) throw badRequest('A valid actor is required');
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function uploadedFields(file, result) {
  const mimeType = result.mimeType || file?.mimetype || 'image/jpeg';
  return {
    provider: result.provider || 'cloudinary',
    providerPublicId: result.providerPublicId,
    url: result.url || result.secureUrl,
    secureUrl: result.secureUrl || result.url,
    resourceType: result.resourceType || MEDIA_RESOURCE_TYPES.IMAGE,
    mimeType,
    format: result.format || mimeType.split('/')[1] || 'bin',
    bytes: result.bytes ?? file?.size ?? null,
    width: result.width ?? file?.width ?? null,
    height: result.height ?? file?.height ?? null,
    alt: file?.alt ?? null
  };
}

export const mediaService = {
  async attach(attachedTo, files, actor, correlationId = null) {
    const target = normalizeAttachedTo(attachedTo);
    const uploadedBy = actorIdFrom(actor);
    const images = Array.isArray(files) ? files : files ? [files] : [];
    if (!images.length) throw badRequest('At least one file is required');

    const existing = await Media.find({ attachedTo: target, status: 'active' }).sort({ displayOrder: 1, createdAt: 1 });
    const needsCover = target.type === 'property' && !existing.some((item) => item.isCover);
    if (target.type === 'property') {
      const maxImages = appConfig.defaults.maxImagesPerProperty;
      if (existing.length + images.length > maxImages) {
        throw conflict('MEDIA_LIMIT_REACHED', `A property can have at most ${maxImages} images`);
      }
    }

    if (target.type === 'user') {
      await this.removeCurrentProfileImage(target.id);
    }

    const uploaded = [];
    try {
      for (const file of images) {
        uploaded.push(await storageProvider.upload(file));
      }
    } catch (error) {
      await Promise.allSettled(uploaded.map((item) => storageProvider.delete(item.providerPublicId)));
      throw error;
    }

    let displayOrder = existing.length
      ? Math.max(...existing.map((item) => item.displayOrder ?? 0)) + 1
      : 0;

    try {
      const documents = await Media.create(uploaded.map((result, index) => ({
        attachedTo: target,
        ...uploadedFields(images[index], result),
        displayOrder: displayOrder + index,
        isCover: needsCover && index === 0,
        status: 'active',
        uploadedBy
      })));

      if (target.type === 'user' && documents.length) {
        const { User } = await import('../users/user.model.js');
        await User.updateOne({ _id: target.id }, { $set: { profileMediaId: documents[0]._id } });
      }
      return documents;
    } catch (error) {
      await Promise.allSettled(uploaded.map((item) => storageProvider.delete(item.providerPublicId)));
      throw error;
    }
  },

  async listFor(type, id) {
    const attachedTo = normalizeAttachedTo({ type, id });
    return Media.find({ attachedTo, status: 'active' }).sort({ displayOrder: 1, createdAt: 1 });
  },

  async getCover(type, id) {
    const attachedTo = normalizeAttachedTo({ type, id });
    return Media.findOne({ attachedTo, status: 'active', isCover: true }).sort({ displayOrder: 1, createdAt: 1 });
  },

  /** First active image per property: explicit cover first, otherwise upload order. */
  async coversFor(ids) {
    const objectIds = (Array.isArray(ids) ? ids : [ids])
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id))));
    if (!objectIds.length) return new Map();

    const documents = await Media.find({
      'attachedTo.type': 'property',
      'attachedTo.id': { $in: objectIds },
      status: 'active',
      resourceType: MEDIA_RESOURCE_TYPES.IMAGE
    })
      .sort({ isCover: -1, displayOrder: 1, createdAt: 1 })
      .lean()
      .exec();

    const covers = new Map();
    for (const document of documents) {
      const key = String(document.attachedTo.id);
      if (covers.has(key)) continue;
      covers.set(key, {
        id: String(document._id),
        mediaId: String(document._id),
        url: document.url,
        secureUrl: document.secureUrl,
        displayOrder: document.displayOrder,
        isCover: Boolean(document.isCover)
      });
    }
    return covers;
  },

  /** Adds `coverImage` to list responses without an N+1 request per item. */
  async attachCovers(items) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return list;
    const covers = await this.coversFor(list.map((item) => item?._id || item?.id));
    return list.map((item) => ({
      ...item,
      coverImage: covers.get(String(item?._id || item?.id)) || null
    }));
  },

  async setCover(type, id, mediaId) {
    const attachedTo = normalizeAttachedTo({ type, id });
    if (!mongoose.Types.ObjectId.isValid(mediaId)) throw badRequest('Invalid media id');
    const media = await Media.findOne({ _id: mediaId, attachedTo, status: 'active' });
    if (!media) throw notFound('Media not found');

    await Media.updateMany(
      { attachedTo, _id: { $ne: media._id }, isCover: true },
      { $set: { isCover: false } }
    );
    media.isCover = true;
    await media.save();
    return media;
  },

  async reorder(type, id, mediaId, displayOrder) {
    const attachedTo = normalizeAttachedTo({ type, id });
    if (!mongoose.Types.ObjectId.isValid(mediaId)) throw badRequest('Invalid media id');
    if (!Number.isInteger(Number(displayOrder)) || Number(displayOrder) < 0) {
      throw badRequest('displayOrder must be a non-negative integer');
    }
    const media = await Media.findOne({ _id: mediaId, attachedTo, status: 'active' });
    if (!media) throw notFound('Media not found');
    media.displayOrder = Number(displayOrder);
    await media.save();
    return media;
  },

  async remove(mediaId, actor = null) {
    if (!mongoose.Types.ObjectId.isValid(mediaId)) throw badRequest('Invalid media id');
    const media = await Media.findById(mediaId);
    if (!media) throw notFound('Media not found');
    if (media.status !== 'active') return media;

    media.status = 'pending_delete';
    await media.save();

    const correlationId = actor?.correlationId || null;
    await jobQueue.cleanupMedia(String(media._id), {
      correlationId,
      idempotencyKey: `media:cleanup:${String(media._id)}`
    });
    return media;
  },

  async cleanup(mediaId) {
    if (!mongoose.Types.ObjectId.isValid(mediaId)) throw badRequest('Invalid media id');
    const media = await Media.findById(mediaId);
    if (!media) throw notFound('Media not found');
    if (media.status === 'deleted') return media;
    if (media.status !== 'pending_delete') {
      throw invalidState('Media must be pending deletion before cleanup');
    }

    await storageProvider.delete(media.providerPublicId);
    media.status = 'deleted';
    await media.save();
    return media;
  },

  async removeCurrentProfileImage(userId) {
    const id = actorIdFrom({ _id: userId });
    const active = await Media.find({ attachedTo: { type: 'user', id }, status: 'active' });
    for (const media of active) {
      await this.remove(media._id, { _id: id });
    }
    const { usersService } = await import('../users/index.js');
    return usersService.clearProfileMedia(id);
  }
};
