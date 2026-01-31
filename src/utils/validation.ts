/**
 * validation.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import type { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { TagService } from '../services/tag.service.js';

/**
 * Validates and normalizes tags from user input.
 * If validation fails, sends an error reply to the user.
 *
 * @param interaction - The interaction to reply to if validation fails
 * @param tagsInput - Raw tags input from user
 * @returns Normalized tags array if valid, null if invalid (error already sent to user)
 */
export async function validateTags(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  tagsInput: string
): Promise<string[] | null> {
  const tags = TagService.normalizeTags(tagsInput);

  if (tags.length === 0) {
    console.warn(`Invalid tags submitted by user ${interaction.user.id} in guild ${interaction.guildId}: "${tagsInput}" (normalized to empty array)`);
    const errorContent = '❌ No valid tags provided. Tags must be alphanumeric + underscore only.';
    if (interaction.deferred) {
      await interaction.editReply({ content: errorContent });
    } else {
      await interaction.reply({ content: errorContent, flags: MessageFlags.Ephemeral });
    }
    return null;
  }

  return tags;
}
