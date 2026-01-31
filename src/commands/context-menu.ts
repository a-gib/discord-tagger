/**
 * context-menu.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import {
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ActionRowBuilder,
  MessageReferenceType,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
} from 'discord.js';
import { MediaService } from '../services/media.service.js';
import { SearchService } from '../services/search.service.js';
import { OcrService } from '../services/ocr.service.js';
import { ThumbnailService } from '../services/thumbnail.service.js';
import { validateTags } from '../utils/validation.js';
import { replyTargets, recallSessions } from './recall.js';
import { createMediaEmbed, createNavigationButtons, createTagsModal, createTagsModalWithDefault } from '../utils/embeds.js';
import { SESSION_TIMEOUT_MS } from '../constants.js';

const mediaSelectionCache = new Map<string, Array<{ url: string; type: string; label: string; thumbnailUrl?: string }>>();
const ocrResultsCache = new Map<string, string[]>();

export async function handleContextMenuCommand(interaction: MessageContextMenuCommandInteraction) {
  const message = interaction.targetMessage;

  const mediaItems: Array<{ url: string; type: string; label: string; thumbnailUrl?: string }> = [];

  // Check if this is a forwarded message
  const isForwarded = message.reference?.type === MessageReferenceType.Forward;
  const snapshot = isForwarded ? message.messageSnapshots.first() : null;

  // Get attachments and embeds from snapshot if forwarded, otherwise from message
  const attachments = snapshot?.attachments ?? message.attachments;
  const embeds = snapshot?.embeds ?? message.embeds;
  const labelSuffix = isForwarded ? ' (forwarded)' : '';

  let attachmentIndex = 1;
  for (const attachment of attachments.values()) {
    const validation = MediaService.validateMediaUrl(attachment.url);
    if (validation.valid && validation.type) {
      const filename = attachment.name || 'unknown';
      mediaItems.push({
        url: attachment.url,
        type: validation.type,
        label: `${validation.type.charAt(0).toUpperCase() + validation.type.slice(1)} ${attachmentIndex} - ${filename}${labelSuffix}`,
      });
      attachmentIndex++;
    }
  }

  let embedIndex = 1;
  for (const embed of embeds) {
    const isGifProvider = embed.provider?.name === 'Tenor' || embed.provider?.name === 'GIPHY';

    if (isGifProvider && embed.url) {
      mediaItems.push({
        url: embed.url,
        type: 'gif',
        label: `GIF from ${embed.provider?.name}${labelSuffix}`,
        ...(embed.thumbnail?.url && { thumbnailUrl: embed.thumbnail.url }),
      });
      embedIndex++;
      continue;
    }

    if (embed.image?.url) {
      const validation = MediaService.validateMediaUrl(embed.image.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.image.url,
          type: validation.type,
          label: `${validation.type.charAt(0).toUpperCase() + validation.type.slice(1)} from embed ${embedIndex}${labelSuffix}`,
        });
      }
    }
    if (embed.video?.url) {
      const validation = MediaService.validateMediaUrl(embed.video.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.video.url,
          type: validation.type,
          label: `Video from embed ${embedIndex}${labelSuffix}`,
        });
      }
    }
    if (embed.thumbnail?.url) {
      const validation = MediaService.validateMediaUrl(embed.thumbnail.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.thumbnail.url,
          type: validation.type,
          label: `Thumbnail from embed ${embedIndex}${labelSuffix}`,
        });
      }
    }
    embedIndex++;
  }

  if (mediaItems.length === 0) {
    const embedInfo = embeds.map(e => `${e.data.type || 'unknown'}`).join(', ');
    console.warn(`No media found in message ${message.id} from user ${interaction.user.id} (guild: ${interaction.guildId}, forwarded: ${isForwarded}, attachments: ${attachments.size}, embeds: ${embeds.length}, embed types: [${embedInfo}])`);
    await interaction.reply({
      content: '❌ Nothing found. Please try a message with an image, GIF, or video.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (mediaItems.length === 1) {
    const selectedMedia = mediaItems[0]!;
    const cacheKey = `${interaction.user.id}_${message.id}`;

    // Defer to buy time for OCR
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Determine what to OCR based on media type
    let ocrTargetUrl: string | null = null;
    let generatedThumbnailUrl: string | null = null;

    if (selectedMedia.type === 'image' || selectedMedia.type === 'gif') {
      ocrTargetUrl = selectedMedia.url;
    } else if (selectedMedia.type === 'video') {
      // For videos, generate thumbnail first and OCR that
      if (ThumbnailService.isEnabled()) {
        generatedThumbnailUrl = await ThumbnailService.generateForUrl(selectedMedia.url);
        if (generatedThumbnailUrl) {
          ocrTargetUrl = generatedThumbnailUrl;
        }
      }
    }

    // Run OCR if we have a target
    let suggestedTags: string[] = [];
    if (ocrTargetUrl) {
      suggestedTags = await OcrService.extractTags(ocrTargetUrl);
    }

    // If OCR found tags, auto-save and show Edit Tags button
    if (suggestedTags.length > 0) {
      try {
        const media = await MediaService.storeMediaWithThumbnail({
          mediaUrl: selectedMedia.url,
          mediaType: selectedMedia.type,
          tags: suggestedTags,
          guildId: interaction.guildId!,
          userId: interaction.user.id,
          ...(selectedMedia.thumbnailUrl && { thumbnailUrl: selectedMedia.thumbnailUrl }),
          ...(generatedThumbnailUrl && { thumbnailUrl: generatedThumbnailUrl }),
        });

        const embed = new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle('Saved Successfully')
          .addFields(
            { name: 'Type', value: selectedMedia.type, inline: true },
            { name: 'Tags', value: suggestedTags.join(', '), inline: false }
          )
          .setTimestamp()
          .setImage(media.thumbnailUrl || selectedMedia.url);

        if (process.env.DEBUG_MODE === 'true') {
          embed.setFooter({ text: `ID: ${media.id}` });
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ocr_edit_tags_${media.id}`)
            .setLabel('Edit Tags')
            .setStyle(ButtonStyle.Primary)
        );

        await interaction.editReply({
          embeds: [embed],
          components: [row],
        });
        return;
      } catch (error) {
        console.error('Error auto-saving with OCR tags:', error);
        // Fall through to manual flow
      }
    }

    // No OCR tags found (or save failed) - show Add Tags button
    mediaSelectionCache.set(cacheKey, mediaItems);
    ocrResultsCache.set(cacheKey, []);

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      mediaSelectionCache.delete(cacheKey);
      ocrResultsCache.delete(cacheKey);
    }, SESSION_TIMEOUT_MS);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`open_save_modal_${message.id}_0`)
        .setLabel('Add Tags')
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.editReply({
      content: 'Ready to save! Add tags:',
      components: [row],
    });
    return;
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`select_media_${message.id}`)
    .setPlaceholder('Choose which media to save')
    .addOptions([
      {
        label: `💾 Save All (${mediaItems.length} items)`,
        description: 'Save all media with the same tags',
        value: 'all',
      },
      ...mediaItems.map((item, index) => ({
        label: item.label,
        description: `${item.type} - Click to save this one`,
        value: index.toString(),
      })),
    ]);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

  mediaSelectionCache.set(`${interaction.user.id}_${message.id}`, mediaItems);

  // Auto-cleanup after 15 minutes
  setTimeout(() => {
    mediaSelectionCache.delete(`${interaction.user.id}_${message.id}`);
  }, SESSION_TIMEOUT_MS);

  await interaction.reply({
    content: `📎 This message has ${mediaItems.length} items. Choose which one to save:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleMediaSelectMenu(interaction: StringSelectMenuInteraction) {
  const messageId = interaction.customId.replace('select_media_', '');
  const selectedValue = interaction.values[0] || '0';

  const modal = createTagsModal(`save_media_${messageId}_${selectedValue}`, 'Save Media to Stash');
  await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  const parts = interaction.customId.replace('save_media_', '').split('_');
  const messageId = parts[0] || '';
  const selectionValue = parts[1] || '0';

  // Defer reply immediately - thumbnail generation can take time
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const tagsInput = interaction.fields.getTextInputValue('tags');
  const tags = await validateTags(interaction, tagsInput);
  if (!tags) return;

  try {
    const cacheKey = `${interaction.user.id}_${messageId}`;
    const mediaItems = mediaSelectionCache.get(cacheKey);

    if (!mediaItems) {
      console.warn(`Media selection session expired for user ${interaction.user.id}, message ${messageId} (guild: ${interaction.guildId}, selectionValue: ${selectionValue})`);
      await interaction.editReply({
        content: '❗ Session expired. Please try again.',
      });
      return;
    }

    if (selectionValue === 'all') {
      const savedMedia = [];

      for (const item of mediaItems) {
        const media = await MediaService.storeMediaWithThumbnail({
          mediaUrl: item.url,
          mediaType: item.type,
          tags,
          guildId: interaction.guildId!,
          userId: interaction.user.id,
        });
        savedMedia.push(media);
      }

      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Bulk save: ${savedMedia.length} items by user ${interaction.user.id} with tags [${tags.join(', ')}]`);
      }

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`✅ Saved ${savedMedia.length} Items`)
        .addFields(
          { name: 'Items', value: savedMedia.length.toString(), inline: true },
          { name: 'Tags', value: tags.join(', '), inline: false }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      mediaSelectionCache.delete(cacheKey);
    } else {
      const mediaIndex = parseInt(selectionValue);

      if (mediaIndex >= mediaItems.length) {
        await interaction.editReply({
          content: '❌ Nothing found.',
        });
        return;
      }

      const selectedMedia = mediaItems[mediaIndex];
      if (!selectedMedia) {
        await interaction.editReply({
          content: '❌ Nothing found.',
        });
        return;
      }

      const mediaUrl = selectedMedia.url;
      const mediaType = selectedMedia.type;

      const media = await MediaService.storeMediaWithThumbnail({
        mediaUrl,
        mediaType,
        tags,
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        ...(selectedMedia.thumbnailUrl && { thumbnailUrl: selectedMedia.thumbnailUrl }),
      });

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Saved Successfully')
        .addFields(
          { name: 'Type', value: mediaType, inline: true },
          { name: 'Tags', value: tags.join(', '), inline: false }
        )
        .setTimestamp()
        .setImage(media.thumbnailUrl || mediaUrl);

      // Only show ID when debug mode is enabled
      if (process.env.DEBUG_MODE === 'true') {
        embed.setFooter({ text: `ID: ${media.id}` });
      }

      await interaction.editReply({ embeds: [embed] });
    }
  } catch (error) {
    console.error('Error saving media from context menu:', error);
    await interaction.editReply({
      content: '❗ Failed to save. Please try again.',
    });
  }
}

export async function handleOpenSaveModalButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.replace('open_save_modal_', '').split('_');
  const messageId = parts[0] || '';
  const selectionValue = parts[1] || '0';

  const cacheKey = `${interaction.user.id}_${messageId}`;
  const suggestedTags = ocrResultsCache.get(cacheKey) || [];

  // Create modal with pre-filled tags
  const modal = createTagsModalWithDefault(
    `save_media_${messageId}_${selectionValue}`,
    'Save Media to Stash',
    suggestedTags.join(' ')
  );

  await interaction.showModal(modal);
}

export async function handleOcrEditTagsButton(interaction: ButtonInteraction) {
  const mediaId = interaction.customId.replace('ocr_edit_tags_', '');

  // Fetch media directly from database
  const media = await MediaService.getMediaById(mediaId);

  if (!media) {
    await interaction.reply({
      content: '❗ Media not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Show edit modal with current tags
  const modal = createTagsModalWithDefault(
    `ocr_edit_modal_${mediaId}`,
    'Edit Tags',
    media.tags.join(' ')
  );

  await interaction.showModal(modal);
}

export async function handleOcrEditModalSubmit(interaction: ModalSubmitInteraction) {
  const mediaId = interaction.customId.replace('ocr_edit_modal_', '');
  const tagsInput = interaction.fields.getTextInputValue('tags') || '';
  const tags = await validateTags(interaction, tagsInput);
  if (!tags) return;

  try {
    const updatedMedia = await MediaService.updateTags(
      mediaId,
      interaction.user.id,
      true, // Allow edit
      tags,
      []
    );

    if (!updatedMedia) {
      await interaction.reply({
        content: '❗ Failed to update tags.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: `Tags updated to: ${tags.join(', ')}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error updating OCR tags:', error);

    if (error instanceof Error && error.message === 'LAST_TAG') {
      await interaction.reply({
        content: '❌ Cannot remove all tags! Media items must have at least one tag.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: '❗ Failed to update tags.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleReplyContextMenu(interaction: MessageContextMenuCommandInteraction) {
  const targetMessage = interaction.targetMessage;

  const modal = createTagsModal(`reply_media_${targetMessage.id}`, 'Reply with Stash');
  await interaction.showModal(modal);
}

export async function handleReplyModalSubmit(interaction: ModalSubmitInteraction) {
  const messageId = interaction.customId.replace('reply_media_', '');
  const tagsInput = interaction.fields.getTextInputValue('tags');
  const tags = await validateTags(interaction, tagsInput);
  if (!tags) return;

  try {
    const results = await SearchService.searchByTags(
      interaction.guildId!,
      tags
    );

    if (results.length === 0) {
      await interaction.reply({
        content: `❌ No results found for tags: ${tags.join(', ')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    replyTargets.set(interaction.user.id, {
      channelId: interaction.channelId!,
      messageId: messageId,
    });

    recallSessions.set(interaction.user.id, results);

    const embed = createMediaEmbed(results[0]!, 1, results.length);
    const buttons = createNavigationButtons(1, results.length, 'recall', results[0]!.id);

    await interaction.reply({
      content: `Found ${results.length} result(s) for: ${tags.join(', ')}. Click "Send" to reply.`,
      embeds: [embed],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error in reply with stash:', error);
    await interaction.reply({
      content: '❗ Search failed.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
