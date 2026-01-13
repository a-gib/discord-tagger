import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from 'discord.js';
import { SearchService } from '../services/search.service.js';
import { MediaService } from '../services/media.service.js';
import { TagService } from '../services/tag.service.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';
import type { MediaRecord } from '../services/media.service.js';

export const deleteSessions = new Map<string, MediaRecord[]>();

export async function handleDeleteCommand(interaction: ChatInputCommandInteraction) {
  const tagsInput = interaction.options.getString('tags', true);
  const typeFilter = interaction.options.getString('type', false);
  const searchTags = TagService.normalizeTags(tagsInput);

  if (searchTags.length === 0) {
    await interaction.reply({
      content: '❌ No valid tags provided. Tags must be alphanumeric + underscore only.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const results = await SearchService.searchByTags(
      interaction.guildId!,
      searchTags,
      typeFilter || undefined
    );

    if (results.length === 0) {
      const filterMsg = typeFilter ? ` (type: ${typeFilter})` : '';
      await interaction.reply({
        content: `❌ No results found for tags: ${searchTags.join(', ')}${filterMsg}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    deleteSessions.set(interaction.user.id, results);

    const embed = createMediaEmbed(results[0]!, 1, results.length);
    const buttons = createNavigationButtons(1, results.length, 'delete', results[0]!.id);

    await interaction.reply({
      content: `Found ${results.length} result(s) for: ${searchTags.join(', ')}\n⚠️ You can only delete your own media (or if you're an admin).`,
      embeds: [embed],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error in delete command:', error);
    await interaction.reply({
      content: '❗ Search failed.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleDeleteButton(interaction: ButtonInteraction) {
  const userId = interaction.user.id;
  const results = deleteSessions.get(userId);

  if (!results) {
    await interaction.reply({
      content: '❗ Session expired. Please run /delete again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [_mode, action, mediaId] = interaction.customId.split('_');
  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    await interaction.reply({
      content: '❗ Not found in current session.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'confirm') {
    const member = interaction.guild?.members.cache.get(userId);
    const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;

    const media = results[currentIndex]!;
    const deleted = await MediaService.deleteMedia(media.id, userId, isAdmin);

    if (!deleted) {
      await interaction.update({
        content: '❌ You can only delete your own items (unless you\'re a server admin).',
        embeds: [],
        components: [],
      });
      return;
    }

    results.splice(currentIndex, 1);

    if (results.length === 0) {
      await interaction.update({
        content: '✅ Deleted! No more results.',
        embeds: [],
        components: [],
      });
      deleteSessions.delete(userId);
      return;
    }

    const newIndex = currentIndex >= results.length ? results.length - 1 : currentIndex;
    const nextMedia = results[newIndex]!;
    const position = newIndex + 1;

    const embed = createMediaEmbed(nextMedia, position, results.length);
    const buttons = createNavigationButtons(position, results.length, 'delete', nextMedia.id);

    await interaction.update({
      content: `✅ Deleted! ${results.length} result(s) remaining.`,
      embeds: [embed],
      components: [buttons],
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
  const buttons = createNavigationButtons(position, results.length, 'delete', media.id);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
