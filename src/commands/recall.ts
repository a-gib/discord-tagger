/**
 * recall.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  MessageContextMenuCommandInteraction,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';
import { SearchService } from '../services/search.service.js';
import { MediaService } from '../services/media.service.js';
import { validateTags } from '../utils/validation.js';
import { handleNavigation } from '../utils/navigation.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';
import { SESSION_TIMEOUT_MS } from '../constants.js';
import type { MediaRecord } from '../services/media.service.js';

export const recallSessions = new Map<string, MediaRecord[]>();
export const replyTargets = new Map<string, { channelId: string; messageId: string }>();

function getExtension(url: string): string {
  const match = url.match(/\.(png|jpg|jpeg|gif|webp|mp4|mov|webm)/i);
  return match?.[1] || 'bin';
}

async function sendMedia(
  interaction: ButtonInteraction,
  media: MediaRecord,
  userId: string,
  replyTarget?: { channelId: string; messageId: string }
): Promise<void> {
  // Fetch channel if not available on interaction
  let channel = interaction.channel;
  if (!channel && interaction.channelId) {
    try {
      const fetchedChannel = await interaction.client.channels.fetch(interaction.channelId);
      if (fetchedChannel && fetchedChannel.isTextBased()) {
        channel = fetchedChannel;
      }
    } catch (error) {
      console.error(`Failed to fetch channel ${interaction.channelId}: ${error}`);
    }
  }

  const channelType = channel?.type;
  const isTextBased = channel?.isTextBased();

  if (!channel || !channel.isTextBased()) {
    console.error(`Cannot send media: Invalid channel - channelId: ${interaction.channelId}, type: ${channelType}, isTextBased: ${isTextBased}, user: ${userId}, guild: ${interaction.guildId}`);
    await interaction.update({
      content: '❌ Cannot send media to this channel type.',
      embeds: [],
      components: [],
    });
    return;
  }

  if (channel.isDMBased()) {
    console.warn(`Cannot send media: DM attempt by user ${userId}`);
    await interaction.update({
      content: '❌ Cannot send media in DMs.',
      embeds: [],
      components: [],
    });
    return;
  }

  try {
    const isDiscordCdn = media.mediaUrl.includes('cdn.discordapp.com') ||
                        media.mediaUrl.includes('media.discordapp.net');

    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB Discord limit

    if (isDiscordCdn) {
      const cleanUrl = media.mediaUrl.replace(/\\&/g, '&');
      const response = await fetch(cleanUrl, { method: 'HEAD' });
      if (!response.ok) throw new Error('Failed to fetch media');

      const contentLength = parseInt(response.headers.get('content-length') || '0');

      // If file is too large, fall back to URL
      if (contentLength > MAX_FILE_SIZE) {
        if (process.env.DEBUG_MODE === 'true') {
          console.log(`[DEBUG] File too large (${(contentLength / 1024 / 1024).toFixed(2)} MB), sending URL instead`);
        }
        const messageContent = `-# Sent by: <@${userId}> | [↗](${media.mediaUrl})`;

        if (replyTarget) {
          const targetChannel = await interaction.client.channels.fetch(replyTarget.channelId);
          if (targetChannel && 'messages' in targetChannel) {
            const targetMessage = await targetChannel.messages.fetch(replyTarget.messageId);
            await targetMessage.reply({
              content: messageContent,
              allowedMentions: { parse: [] },
            });
          }
        } else {
          if ('send' in channel) {
            await channel.send({
              content: messageContent,
              allowedMentions: { parse: [] },
            });
          }
        }
      } else {
        // Re-upload the file
        const fullResponse = await fetch(cleanUrl);
        const buffer = Buffer.from(await fullResponse.arrayBuffer());
        const filename = media.fileName || `media.${getExtension(media.mediaUrl)}`;
        const attachment = new AttachmentBuilder(buffer, { name: filename });
        const metadataText = `-# Sent by: <@${userId}>`;

        if (replyTarget) {
          const targetChannel = await interaction.client.channels.fetch(replyTarget.channelId);
          if (targetChannel && 'messages' in targetChannel) {
            const targetMessage = await targetChannel.messages.fetch(replyTarget.messageId);
            await targetMessage.reply({
              content: metadataText,
              files: [attachment],
              allowedMentions: { parse: [] },
            });
          }
        } else {
          if ('send' in channel) {
            await channel.send({
              content: metadataText,
              files: [attachment],
              allowedMentions: { parse: [] },
            });
          }
        }
      }
    } else {
      const messageContent = `-# Sent by: <@${userId}> | [↗](${media.mediaUrl})`;

      if (replyTarget) {
        const targetChannel = await interaction.client.channels.fetch(replyTarget.channelId);
        if (targetChannel && 'messages' in targetChannel) {
          const targetMessage = await targetChannel.messages.fetch(replyTarget.messageId);
          await targetMessage.reply({
            content: messageContent,
            allowedMentions: { parse: [] },
          });
        }
      } else {
        if ('send' in channel) {
          await channel.send({
            content: messageContent,
            allowedMentions: { parse: [] },
          });
        }
      }
    }

    await MediaService.incrementRecallCount(media.id);

    await interaction.update({
      content: '✅ Sent!',
      embeds: [],
      components: [],
    });
  } catch (error: unknown) {
    console.error('Error sending media:', error);
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 50001) {
        await interaction.update({
          content:
            '❌ I don\'t have permission to send messages in this channel.\n' +
            'Please give me the **Send Messages** permission in Server Settings → Roles.',
          embeds: [],
          components: [],
        });
        return;
      } else if (error.code === 40005) {
        // File too large - send URL instead
        console.warn(`File too large for upload, falling back to URL for media ${media.id}`);
        const messageContent = `-# Sent by: <@${userId}> | [↗](${media.mediaUrl})`;

        if ('send' in channel) {
          await channel.send({
            content: messageContent,
            allowedMentions: { parse: [] },
          });
        }

        await MediaService.incrementRecallCount(media.id);
        await interaction.update({
          content: '✅ Sent! (File was too large, sent as link)',
          embeds: [],
          components: [],
        });
        return;
      }
    }

    await interaction.update({
      content: '❗ Failed to send. Please try again.',
      embeds: [],
      components: [],
    });
  }
}

export async function handleRecallCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.guild && interaction.channel && interaction.channel.type !== ChannelType.DM && 'guild' in interaction.channel) {
    const member = interaction.guild.members.cache.get(interaction.user.id);
    const hasEmbedPermission = member?.permissionsIn(interaction.channel.id).has(PermissionFlagsBits.EmbedLinks) ?? false;

    if (!hasEmbedPermission) {
      console.warn(`User ${interaction.user.id} lacks embed permission in channel ${interaction.channelId} (guild: ${interaction.guildId})`);
      await interaction.reply({
        content: '❌ You don\'t have permission to embed links in this channel.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  const tagsInput = interaction.options.getString('tags', true);
  const typeFilter = interaction.options.getString('type', false);
  const searchTags = await validateTags(interaction, tagsInput);
  if (!searchTags) return;

  try {
    const results = await SearchService.searchByTags(
      interaction.guildId!,
      searchTags,
      typeFilter || undefined
    );

    if (process.env.DEBUG_MODE === 'true') {
      console.log(`[DEBUG] Recall search: ${results.length} results for tags [${searchTags.join(', ')}] by user ${interaction.user.id}`);
    }

    if (results.length === 0) {
      const filterMsg = typeFilter ? ` (type: ${typeFilter})` : '';
      await interaction.reply({
        content: `❌ No results found for tags: ${searchTags.join(', ')}${filterMsg}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userId = interaction.user.id;
    recallSessions.set(userId, results);

    // Auto-cleanup after timeout
    setTimeout(() => {
      recallSessions.delete(userId);
    }, SESSION_TIMEOUT_MS);

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

export async function handleRecallButton(interaction: ButtonInteraction) {
  const userId = interaction.user.id;
  const results = recallSessions.get(userId);

  if (!results) {
    console.warn(`Recall session expired for user ${userId} (guild: ${interaction.guildId}, customId: ${interaction.customId})`);
    await interaction.reply({
      content: '❗ Session expired. Please run /get again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const [_mode, action, mediaId] = interaction.customId.split('_');
  if (!action || !mediaId) return;

  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    console.error(`Media ${mediaId} not found in recall session for user ${userId} (guild: ${interaction.guildId}, session has ${results.length} items, action: ${action})`);
    await interaction.reply({
      content: '❗ Something went wrong.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'send') {
    const media = results[currentIndex]!;
    const replyTarget = replyTargets.get(userId);
    if (process.env.DEBUG_MODE === 'true') {
      console.log(`[DEBUG] Sending media ${media.id} by user ${userId}, isReply: ${!!replyTarget}`);
    }
    await sendMedia(interaction, media, userId, replyTarget);
    recallSessions.delete(userId);
    replyTargets.delete(userId);
    return;
  }

  await handleNavigation(interaction, results, action, mediaId, 'recall');
}

export async function handleDeleteStashMessage(interaction: MessageContextMenuCommandInteraction) {
  const message = interaction.targetMessage;

  if (message.author.id !== interaction.client.user?.id) {
    await interaction.reply({
      content: '❌ This is not a Stash message.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const senderMatch = message.content.match(/-# Sent by: <@(\d+)>/);
  if (!senderMatch) {
    console.error(`Could not parse sender from Stash message ${message.id} (guild: ${interaction.guildId}, content preview: "${message.content.substring(0, 100)}")`);
    await interaction.reply({
      content: '❗ Could not identify the sender.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const senderId = senderMatch[1];
  const hasPermission =
    interaction.user.id === senderId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

  if (!hasPermission) {
    console.warn(`User ${interaction.user.id} attempted to delete Stash message sent by ${senderId} (guild: ${interaction.guildId}, hasManageMessages: ${interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)})`);
    await interaction.reply({
      content: '❌ Only the sender or moderators can delete this.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await message.delete();
    await interaction.deleteReply();
  } catch (error) {
    console.error('Error deleting Stash message:', error);
    await interaction.reply({
      content: '❌ Failed to delete. Make sure I have permission to manage messages.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
