import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageFlags,
} from 'discord.js';
import { SearchService } from '../services/search.service.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';
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

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      topSessions.delete(response.id);
    }, 15 * 60 * 1000);
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
    await interaction.reply({
      content: '❗ Session expired. Please run /top again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [_mode, action, mediaId] = interaction.customId.split('_');
  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    await interaction.reply({
      content: '❗ Something went wrong.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let newIndex = currentIndex;
  if (action === 'prev') {
    newIndex = Math.max(0, currentIndex - 1);
  } else if (action === 'next') {
    newIndex = Math.min(results.length - 1, currentIndex + 1);
  }

  const media = results[newIndex]!;
  const position = newIndex + 1;

  const embed = createMediaEmbed(media, position, results.length);
  const buttons = createNavigationButtons(position, results.length, 'top', media.id);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
