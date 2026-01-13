/**
 * permissions.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import { ALLOWED_GUILD_IDS } from '../constants.js';

/**
 * Check if the bot is allowed to operate in the given guild
 * @param guildId The guild ID to check
 * @returns true if allowed, false if restricted
 */
export function isGuildAllowed(guildId: string | null): boolean {
  // If no restrictions configured, allow all guilds
  if (!ALLOWED_GUILD_IDS) {
    return true;
  }

  // If no guild ID (DMs), deny
  if (!guildId) {
    return false;
  }

  // Check if guild is in allowed list
  return ALLOWED_GUILD_IDS.includes(guildId);
}
