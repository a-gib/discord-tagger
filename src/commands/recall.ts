import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageContextMenuCommandInteraction,
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
export const recallSessions = new Map<string, MediaRecord[]>();

// Store reply targets (userId -> { channelId, messageId })
export const replyTargets = new Map<string, { channelId: string; messageId: string }>();

export async function handleRecallCommand(interaction: ChatInputCommandInteraction) {
  // Check if user has permission to embed links in this channel
  if (interaction.guild && interaction.channel && interaction.channel.type !== ChannelType.DM && 'guild' in interaction.channel) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const hasEmbedPermission = member?.permissionsIn(interaction.channel.id).has(PermissionFlagsBits.EmbedLinks) ?? false;

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
        content: `❌ No results found for tags: ${searchTags.join(', ')}${filterMsg}`,
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
      content: '❗ Search failed.',
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
      content: '❗ Session expired. Please run /get again.',
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
      content: '❗ Something went wrong.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'send') {
    // Send media to channel (public message) or as reply
    const media = results[currentIndex]!;

    // Check if this is a reply session
    const replyTarget = replyTargets.get(userId);

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

        if (replyTarget) {
          // Send as reply to target message
          const targetChannel = await interaction.client.channels.fetch(replyTarget.channelId);
          if (targetChannel && 'messages' in targetChannel) {
            const targetMessage = await targetChannel.messages.fetch(replyTarget.messageId);
            await targetMessage.reply({
              content: messageContent,
              allowedMentions: { parse: [] },
            });
          }
        } else {
          // Send as regular message
          await interaction.channel.send({
            content: messageContent,
            allowedMentions: { parse: [] }, // Silent mention - no notification
          });
        }

        // Increment recall count
        await MediaService.incrementRecallCount(media.id);

        // Show brief success message
        await interaction.update({
          content: '✅ Sent!',
          embeds: [],
          components: [],
        });

        // Clean up sessions
        recallSessions.delete(userId);
        replyTargets.delete(userId);
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
            content: '❗ Failed to send. Please try again.',
            embeds: [],
            components: [],
          });
        }
        recallSessions.delete(userId);
        replyTargets.delete(userId);
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

/**
 * Handle "Delete Tagger Message" context menu command
 */
export async function handleDeleteTaggerMessage(interaction: MessageContextMenuCommandInteraction) {
  const message = interaction.targetMessage;

  // Check if message was sent by the bot
  if (message.author.id !== interaction.client.user?.id) {
    await interaction.reply({
      content: '❌ This is not a Tagger message.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Parse sender ID from message content
  const senderMatch = message.content.match(/-# Sent by: <@(\d+)>/);
  if (!senderMatch) {
    await interaction.reply({
      content: '❗ Could not identify the sender.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const senderId = senderMatch[1];

  // Check permissions: original sender OR has Manage Messages
  const hasPermission =
    interaction.user.id === senderId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Only the sender or moderators can delete this.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Delete the message
  try {
    await message.delete();
    await interaction.reply({
      content: '✅ Message deleted.',
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error deleting Tagger message:', error);
    await interaction.reply({
      content: '❌ Failed to delete. Make sure I have permission to manage messages.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
