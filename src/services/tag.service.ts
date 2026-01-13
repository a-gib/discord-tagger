/**
 * TagService - Handles tag normalization and validation
 *
 * Tag rules:
 * - Lowercase only
 * - Alphanumeric + underscore only (a-z, 0-9, _)
 * - Max 50 characters per tag
 * - Max 20 tags per media
 */

export class TagService {
  /**
   * Normalize tags from user input
   * Input: "Funny Cat, John_Doe test123 test123"
   * Output: ["funny_cat", "john_doe", "test123"] (duplicates removed)
   */
  static normalizeTags(input: string): string[] {
    const tags = input
      .toLowerCase()
      // Split by spaces or commas
      .split(/[\s,]+/)
      // Remove invalid characters (keep only alphanumeric + underscore)
      .map((tag) => tag.replace(/[^a-z0-9_]/g, ''))
      // Remove empty strings
      .filter((tag) => tag.length > 0)
      // Limit tag length to 50 characters
      .filter((tag) => tag.length <= 50);

    // Remove duplicates using Set, then limit to 20 tags
    return Array.from(new Set(tags)).slice(0, 20);
  }
}
