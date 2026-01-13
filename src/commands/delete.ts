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

// Store active delete sessions (userId -> search results)
const deleteSessions = new Map<string, MediaRecord[]>();

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
    // Search for media with optional type filter
    const results = await SearchService.searchByTags(
      interaction.guildId!,
      searchTags,
      typeFilter || undefined
    );

    if (results.length === 0) {
      const filterMsg = typeFilter ? ` (type: ${typeFilter})` : '';
      await interaction.reply({
        content: `❌ No media found matching tags: ${searchTags.join(', ')}${filterMsg}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store session
    deleteSessions.set(interaction.user.id, results);

    // Show first result
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
      content: '❌ An error occurred while searching for media.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle button interactions for delete carousel
 */
export async function handleDeleteButton(interaction: ButtonInteraction) {
  const userId = interaction.user.id;
  const results = deleteSessions.get(userId);

  if (!results) {
    await interaction.reply({
      content: '❌ Session expired. Please run /delete again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse button action
  const [_mode, action, mediaId] = interaction.customId.split('_');

  // Find current position
  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    await interaction.reply({
      content: '❌ Media not found in current session.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'confirm') {
    // Check if user is admin
    const member = interaction.guild?.members.cache.get(userId);
    const isAdmin = member?.permissions.has(PermissionFlagsBits.ManageGuild) ?? false;

    // Delete media
    const media = results[currentIndex]!;
    const deleted = await MediaService.deleteMedia(media.id, userId, isAdmin);

    if (!deleted) {
      await interaction.update({
        content: '❌ Failed to delete. You can only delete your own media (or if you\'re an admin).',
        embeds: [],
        components: [],
      });
      return;
    }

    // Remove from session
    results.splice(currentIndex, 1);

    if (results.length === 0) {
      await interaction.update({
        content: '✅ Media deleted! No more results.',
        embeds: [],
        components: [],
      });
      deleteSessions.delete(userId);
      return;
    }

    // Show next media (or previous if at end)
    const newIndex = currentIndex >= results.length ? results.length - 1 : currentIndex;
    const nextMedia = results[newIndex]!;
    const position = newIndex + 1;

    const embed = createMediaEmbed(nextMedia, position, results.length);
    const buttons = createNavigationButtons(position, results.length, 'delete', nextMedia.id);

    await interaction.update({
      content: `✅ Media deleted! ${results.length} result(s) remaining.`,
      embeds: [embed],
      components: [buttons],
    });

    return;
  }

  // Navigate previous/next
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
