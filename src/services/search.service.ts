import prisma from '../utils/db.js';
import type { MediaRecord } from './media.service.js';

interface ScoredMedia {
  media: MediaRecord;
  score: number; // Number of matching tags
  matchedTags: string[]; // Which tags matched
}

export class SearchService {
  /**
   * Search for media by tags within a guild
   * Returns results ranked by number of matching tags (best first)
   * @param typeFilter - Optional media type to filter by ('image', 'gif', 'video')
   */
  static async searchByTags(
    guildId: string,
    searchTags: string[],
    typeFilter?: string
  ): Promise<MediaRecord[]> {
    // Get all media in this guild, optionally filtered by type
    const allMedia = await prisma.media.findMany({
      where: {
        guildId,
        ...(typeFilter ? { mediaType: typeFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // Score each media entry by tag overlap
    const scored: ScoredMedia[] = allMedia
      .map((media: any): ScoredMedia => {
        const mediaTags = media.tags;
        const matchedTags = searchTags.filter((tag) => mediaTags.includes(tag));

        const mediaRecord: MediaRecord = {
          id: media.id,
          mediaUrl: media.mediaUrl,
          mediaType: media.mediaType,
          tags: mediaTags,
          guildId: media.guildId,
          userId: media.userId,
          channelId: media.channelId,
          recallCount: media.recallCount,
          createdAt: media.createdAt,
          updatedAt: media.updatedAt,
        };

        // Only include optional properties if they exist
        if (media.messageId !== null) mediaRecord.messageId = media.messageId;
        if (media.fileName !== null) mediaRecord.fileName = media.fileName;
        if (media.fileSize !== null) mediaRecord.fileSize = media.fileSize;
        if (media.width !== null) mediaRecord.width = media.width;
        if (media.height !== null) mediaRecord.height = media.height;

        return {
          media: mediaRecord,
          score: matchedTags.length,
          matchedTags,
        };
      })
      // Only keep media with at least one matching tag
      .filter((item: any): item is ScoredMedia => item.score > 0);

    // Sort by: 1) score (most matching tags), 2) recall count (most popular), 3) creation date (newest)
    scored.sort((a, b) => {
      // First: sort by number of matching tags
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Second: sort by recall count (popularity)
      if (b.media.recallCount !== a.media.recallCount) {
        return b.media.recallCount - a.media.recallCount;
      }
      // Third: sort by creation date (newest first)
      return b.media.createdAt.getTime() - a.media.createdAt.getTime();
    });

    return scored.map((item) => item.media);
  }

  /**
   * Get top media by recall count within a guild
   * @param typeFilter - Optional media type to filter by ('image', 'gif', 'video')
   */
  static async getTopMedia(guildId: string, typeFilter?: string): Promise<MediaRecord[]> {
    // Get all media in this guild, optionally filtered by type
    const allMedia = await prisma.media.findMany({
      where: {
        guildId,
        ...(typeFilter ? { mediaType: typeFilter } : {}),
      },
      orderBy: [
        { recallCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Convert to MediaRecord format
    return allMedia.map((media: any) => {
      const mediaRecord: MediaRecord = {
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
      if (media.messageId !== null) mediaRecord.messageId = media.messageId;
      if (media.fileName !== null) mediaRecord.fileName = media.fileName;
      if (media.fileSize !== null) mediaRecord.fileSize = media.fileSize;
      if (media.width !== null) mediaRecord.width = media.width;
      if (media.height !== null) mediaRecord.height = media.height;

      return mediaRecord;
    });
  }
}
