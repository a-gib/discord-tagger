import prisma from '../utils/db.js';

export interface MediaData {
  mediaUrl: string;
  mediaType: string;
  tags: string[];
  guildId: string;
  userId: string;
  channelId: string;
  messageId?: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
}

export interface MediaRecord extends Omit<MediaData, 'tags'> {
  id: string;
  tags: string[]; // Parsed from JSON
  recallCount: number; // How many times this was recalled
  createdAt: Date;
  updatedAt: Date;
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
        channelId: data.channelId,
        ...(data.messageId !== undefined && { messageId: data.messageId }),
        ...(data.fileName !== undefined && { fileName: data.fileName }),
        ...(data.fileSize !== undefined && { fileSize: data.fileSize }),
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
      },
    });

    return this.parseMediaRecord(media);
  }

  /**
   * Get a single media entry by ID
   */
  static async getMediaById(id: string): Promise<MediaRecord | null> {
    const media = await prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      return null;
    }

    return this.parseMediaRecord(media);
  }

  /**
   * Delete a media entry with permission check
   * Returns true if deleted, false if not found or no permission
   */
  static async deleteMedia(id: string, userId: string, isAdmin: boolean): Promise<boolean> {
    const media = await prisma.media.findUnique({
      where: { id },
    });

    if (!media) {
      return false;
    }

    // Check permissions: user must be owner OR admin
    if (media.userId !== userId && !isAdmin) {
      return false;
    }

    await prisma.media.delete({
      where: { id },
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
    channelId: string;
    messageId: string | null;
    fileName: string | null;
    fileSize: number | null;
    width: number | null;
    height: number | null;
    recallCount: number;
    createdAt: Date;
    updatedAt: Date;
  }): MediaRecord {
    const result: MediaRecord = {
      id: media.id,
      mediaUrl: media.mediaUrl,
      mediaType: media.mediaType,
      tags: media.tags,
      guildId: media.guildId,
      userId: media.userId,
      channelId: media.channelId,
      recallCount: media.recallCount,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
    };

    // Only include optional properties if they exist
    if (media.messageId !== null) result.messageId = media.messageId;
    if (media.fileName !== null) result.fileName = media.fileName;
    if (media.fileSize !== null) result.fileSize = media.fileSize;
    if (media.width !== null) result.width = media.width;
    if (media.height !== null) result.height = media.height;

    return result;
  }
}
