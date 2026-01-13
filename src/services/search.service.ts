/**
 * search.service.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import prisma from '../utils/db.js';
import { MediaService, type MediaRecord } from './media.service.js';

interface ScoredMedia {
  media: MediaRecord;
  score: number;
  matchedTags: string[];
}

export class SearchService {
  static async searchByTags(
    guildId: string,
    searchTags: string[],
    typeFilter?: string
  ): Promise<MediaRecord[]> {
    const allMedia = await prisma.media.findMany({
      where: {
        guildId,
        deletedAt: null,
        ...(typeFilter ? { mediaType: typeFilter } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    const scored: ScoredMedia[] = allMedia
      .map((media): ScoredMedia => {
        const mediaTags = media.tags;
        const matchedTags = searchTags.filter((tag) => mediaTags.includes(tag));
        const mediaRecord = MediaService.parseMediaRecord(media);

        return {
          media: mediaRecord,
          score: matchedTags.length,
          matchedTags,
        };
      })
      .filter((item): item is ScoredMedia => item.score > 0);

    // Sort by: 1) matching tags, 2) popularity, 3) recency
    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (b.media.recallCount !== a.media.recallCount) {
        return b.media.recallCount - a.media.recallCount;
      }
      return b.media.createdAt.getTime() - a.media.createdAt.getTime();
    });

    return scored.map((item) => item.media);
  }

  static async getTopMedia(guildId: string, typeFilter?: string): Promise<MediaRecord[]> {
    const allMedia = await prisma.media.findMany({
      where: {
        guildId,
        deletedAt: null,
        ...(typeFilter ? { mediaType: typeFilter } : {}),
      },
      orderBy: [
        { recallCount: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return allMedia.map((media) => MediaService.parseMediaRecord(media));
  }
}
