import prisma from '../utils/db.js';

export interface MediaData {
  mediaUrl: string;
  mediaType: string;
  tags: string[];
  guildId: string;
  userId: string;
  fileName?: string;
}

export interface MediaRecord {
  id: string;
  mediaUrl: string;
  mediaType: string;
  tags: string[];
  guildId: string;
  userId: string;
  fileName?: string;
  recallCount: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export class MediaService {
  /**
   * Validate a media URL and detect media type
   * Returns { valid: boolean, type: 'image' | 'gif' | 'video' | null }
   */
  static validateMediaUrl(url: string): { valid: boolean; type: string | null } {
    const lowerUrl = url.toLowerCase();

    // Check for image extensions
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const gifExt = '.gif';
    const videoExts = ['.mp4', '.mov', '.webm'];

    if (imageExts.some((ext) => lowerUrl.includes(ext))) {
      return { valid: true, type: 'image' };
    }

    if (lowerUrl.includes(gifExt)) {
      return { valid: true, type: 'gif' };
    }

    if (videoExts.some((ext) => lowerUrl.includes(ext))) {
      return { valid: true, type: 'video' };
    }

    return { valid: false, type: null };
  }

  /**
   * Store a new media entry in the database
   */
  static async storeMedia(data: MediaData): Promise<MediaRecord> {
    const media = await prisma.media.create({
      data: {
        mediaUrl: data.mediaUrl,
        mediaType: data.mediaType,
        tags: data.tags,
        guildId: data.guildId,
        userId: data.userId,
        ...(data.fileName !== undefined && { fileName: data.fileName }),
      },
    });

    return this.parseMediaRecord(media);
  }

  /**
   * Get a single media entry by ID (excludes soft-deleted)
   */
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

  /**
   * Soft delete a media entry with permission check
   * Returns true if deleted, false if not found or no permission
   */
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

    // Check permissions: user must be owner OR admin
    if (media.userId !== userId && !isAdmin) {
      return false;
    }

    await prisma.media.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return true;
  }

  /**
   * Increment recall count for a media entry
   */
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

  /**
   * Parse a database media record
   */
  private static parseMediaRecord(media: {
    id: string;
    mediaUrl: string;
    mediaType: string;
    tags: string[];
    guildId: string;
    userId: string;
    fileName: string | null;
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
      fileName: media.fileName ?? undefined,
      recallCount: media.recallCount,
      createdAt: media.createdAt,
      deletedAt: media.deletedAt,
    };
  }
}
