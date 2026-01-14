/**
 * top.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { SearchService } from '../services/search.service.js';
import { handleNavigation } from '../utils/navigation.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';
import { SESSION_TIMEOUT_MS } from '../constants.js';
import type { MediaRecord } from '../services/media.service.js';

export const topSessions = new Map<string, MediaRecord[]>();

export async function handleTopCommand(interaction: ChatInputCommandInteraction) {
  const typeFilter = interaction.options.getString('type', false);

  try {
    const results = await SearchService.getTopMedia(
      interaction.guildId!,
      typeFilter || undefined
    );

    if (results.length === 0) {
      const filterMsg = typeFilter ? ` (type: ${typeFilter})` : '';
      await interaction.reply({
        content: `❌ No results found${filterMsg}`,
      });
      return;
    }

    const embed = createMediaEmbed(results[0]!, 1, results.length);
    const buttons = createNavigationButtons(1, results.length, 'top', results[0]!.id);

    const filterMsg = typeFilter ? ` (${typeFilter})` : '';
    const response = await interaction.reply({
      content: `🏆 Top ${results.length} most used${filterMsg}`,
      embeds: [embed],
      components: [buttons],
      fetchReply: true,
    });

    topSessions.set(response.id, results);

    // Auto-cleanup after timeout
    setTimeout(() => {
      topSessions.delete(response.id);
    }, SESSION_TIMEOUT_MS);
  } catch (error) {
    console.error('Error in top command:', error);
    await interaction.reply({
      content: '❗ Failed to fetch results.',
    });
  }
}

export async function handleTopButton(interaction: ButtonInteraction) {
  const messageId = interaction.message.id;
  const results = topSessions.get(messageId);

  if (!results) {
    console.warn(`Top session expired for message ${messageId} (guild: ${interaction.guildId}, user: ${interaction.user.id}, customId: ${interaction.customId})`);
    await interaction.reply({
      content: '❗ Session expired. Please run /top again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [_mode, action, mediaId] = interaction.customId.split('_');
  if (!action || !mediaId) return;

  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    console.error(`Media ${mediaId} not found in top session for message ${messageId} (guild: ${interaction.guildId}, session has ${results.length} items, action: ${action})`);
    await interaction.reply({
      content: '❗ Something went wrong.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await handleNavigation(interaction, results, action, mediaId, 'top');
}
