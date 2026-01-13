import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  EmbedBuilder,
  Colors,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { SearchService } from '../services/search.service.js';
import { TagService } from '../services/tag.service.js';
import { MediaService } from '../services/media.service.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';
import type { MediaRecord } from '../services/media.service.js';

// Store active recall sessions (userId -> search results)
const recallSessions = new Map<string, MediaRecord[]>();

export async function handleRecallCommand(interaction: ChatInputCommandInteraction) {
  // Check if user has permission to embed links in this channel
  if (interaction.guild && interaction.channel && interaction.channel.type !== ChannelType.DM) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const hasEmbedPermission = member?.permissionsIn(interaction.channel).has(PermissionFlagsBits.EmbedLinks) ?? false;

    if (!hasEmbedPermission) {
      await interaction.reply({
        content: '❌ You don\'t have permission to embed links in this channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

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
    recallSessions.set(interaction.user.id, results);

    // Show first result
    const embed = createMediaEmbed(results[0]!, 1, results.length);
    const buttons = createNavigationButtons(1, results.length, 'recall', results[0]!.id);

    await interaction.reply({
      content: `Found ${results.length} result(s) for: ${searchTags.join(', ')}`,
      embeds: [embed],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error in recall command:', error);
    await interaction.reply({
      content: '❌ An error occurred while searching for media.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle button interactions for recall carousel
 */
export async function handleRecallButton(interaction: ButtonInteraction) {
  const userId = interaction.user.id;
  const results = recallSessions.get(userId);

  if (!results) {
    await interaction.reply({
      content: '❌ Session expired. Please run /get again.',
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

  if (action === 'send') {
    // Send media to channel (public message)
    const media = results[currentIndex]!;

    // Check if channel supports sending messages
    if (
      interaction.channel &&
      interaction.channel.type !== ChannelType.DM &&
      interaction.channel.type !== ChannelType.GroupDM &&
      'send' in interaction.channel
    ) {
      try {
        // Send message with footer above URL (sent by + tags in subtext)
        const messageContent = `-# Sent by: <@${userId}> | Tags: ${media.tags.join(', ')}\n${media.mediaUrl}`;

        await interaction.channel.send({
          content: messageContent,
          allowedMentions: { parse: [] }, // Silent mention - no notification
        });

        // Increment recall count
        await MediaService.incrementRecallCount(media.id);

        // Show brief success message
        await interaction.update({
          content: '✅ Sent!',
          embeds: [],
          components: [],
        });

        // Clean up session
        recallSessions.delete(userId);
        return;
      } catch (error: unknown) {
        console.error('Error sending media:', error);

        // Check if it's a permission error
        if (error && typeof error === 'object' && 'code' in error && error.code === 50001) {
          await interaction.update({
            content:
              '❌ I don\'t have permission to send messages in this channel.\n' +
              'Please give me the **Send Messages** permission in Server Settings → Roles.',
            embeds: [],
            components: [],
          });
        } else {
          await interaction.update({
            content: '❌ Failed to send media. Please try again.',
            embeds: [],
            components: [],
          });
        }
        recallSessions.delete(userId);
        return;
      }
    } else {
      await interaction.update({
        content: '❌ Cannot send media to this channel type.',
        embeds: [],
        components: [],
      });
      return;
    }
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
  const buttons = createNavigationButtons(position, results.length, 'recall', media.id);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
