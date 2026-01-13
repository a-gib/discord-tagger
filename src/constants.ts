/**
 * Bot configuration constants
 */

// Owner permissions (from environment variable)
// Set BOT_OWNER_ID in .env to enable /debug command access
export const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

// Session timeouts
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

// Tag constraints
export const MAX_TAG_LENGTH = 50;
export const MAX_TAGS_PER_ITEM = 20;
export const TAG_INPUT_MAX_LENGTH = 500;

// Media type extensions
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
export const GIF_EXTENSION = '.gif';
export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'] as const;
