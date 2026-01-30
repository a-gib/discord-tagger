/**
 * media.service.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import prisma from '../utils/db.js';
import { IMAGE_EXTENSIONS, GIF_EXTENSION, VIDEO_EXTENSIONS } from '../constants.js';

export interface MediaData {
  mediaUrl: string;
  mediaType: string;
  tags: string[];
  guildId: string;
  userId: string;
  fileName?: string;
  thumbnailUrl?: string;
}

export interface MediaRecord {
  id: string;
  mediaUrl: string;
  mediaType: string;
  tags: string[];
  guildId: string;
  userId: string;
  fileName?: string;
  thumbnailUrl?: string;
  recallCount: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export class MediaService {
  static validateMediaUrl(url: string): { valid: boolean; type: string | null } {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('tenor.com/view/') || lowerUrl.includes('giphy.com/gifs/')) {
      return { valid: true, type: 'gif' };
    }

    if (IMAGE_EXTENSIONS.some((ext) => lowerUrl.includes(ext))) {
      return { valid: true, type: 'image' };
    }

    if (lowerUrl.includes(GIF_EXTENSION)) {
      return { valid: true, type: 'gif' };
    }

    if (VIDEO_EXTENSIONS.some((ext) => lowerUrl.includes(ext))) {
      return { valid: true, type: 'video' };
    }

    return { valid: false, type: null };
  }

  static async storeMedia(data: MediaData): Promise<MediaRecord> {
    const media = await prisma.media.create({
      data: {
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        tags: data.tags,
        guildId: data.guildId,
        userId: data.userId,
        ...(data.fileName !== undefined && { fileName: data.fileName }),
        ...(data.thumbnailUrl !== undefined && { thumbnailUrl: data.thumbnailUrl }),
      },
    });

    return this.parseMediaRecord(media);
  }

  static async getMediaById(id: string): Promise<MediaRecord | null> {
    const media = await prisma.media.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!media) {
      return null;
    }

    return this.parseMediaRecord(media);
  }

  static async deleteMedia(id: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const media = await prisma.media.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!media) {
      return false;
    }

    if (media.userId !== userId && !isAdmin) {
      return false;
    }

    await prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return true;
  }

  static async updateTags(
    id: string,
    _userId: string,
    _isAdmin: boolean,
    newTags: string[],
    _unused?: string[] // Kept for backwards compatibility
  ): Promise<MediaRecord | null> {
    const media = await prisma.media.findFirst({
      where: { id, deletedAt: null },
    });

    if (!media) {
      return null;
    }

    // Anyone can edit tags - no permission check needed

    // Validate: Must have at least one tag
    if (newTags.length === 0) {
      throw new Error('LAST_TAG');
    }

    // Enforce max tags limit
    const finalTags = newTags.slice(0, 20);

    const updated = await prisma.media.update({
      where: { id },
      data: { tags: finalTags },
    });

    return this.parseMediaRecord(updated);
  }

  static async incrementRecallCount(id: string): Promise<void> {
    await prisma.media.update({
      where: { id },
      data: {
        recallCount: {
          increment: 1,
        },
      },
    });
  }

  static async purgeGuild(guildId: string): Promise<number> {
    const result = await prisma.media.updateMany({
      where: {
        guildId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return result.count;
  }

  static parseMediaRecord(media: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    tags: string[];
    guildId: string;
    userId: string;
    fileName: string | null;
    thumbnailUrl: string | null;
    recallCount: number;
    createdAt: Date;
    deletedAt: Date | null;
  }): MediaRecord {
    return {
      id: media.id,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      tags: media.tags,
      guildId: media.guildId,
      userId: media.userId,
      ...(media.fileName !== null && { fileName: media.fileName }),
      ...(media.thumbnailUrl !== null && { thumbnailUrl: media.thumbnailUrl }),
      recallCount: media.recallCount,
      createdAt: media.createdAt,
      deletedAt: media.deletedAt,
    };
  }
}
