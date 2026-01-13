/**
 * tag.service.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

export class TagService {
  static normalizeTags(input: string): string[] {
    const tags = input
      .toLowerCase()
      .split(/[\s,]+/)
      .map((tag) => tag.replace(/[^a-z0-9_]/g, ''))
      .filter((tag) => tag.length > 0)
      .filter((tag) => tag.length <= 50);

    return Array.from(new Set(tags)).slice(0, 20);
  }
}
