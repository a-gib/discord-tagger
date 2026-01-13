import {
  MessageContextMenuCommandInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ModalSubmitInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
} from 'discord.js';
import { MediaService } from '../services/media.service.js';
import { TagService } from '../services/tag.service.js';
import { SearchService } from '../services/search.service.js';
import { replyTargets, recallSessions } from './recall.js';
import { createMediaEmbed, createNavigationButtons } from '../utils/embeds.js';

// Store media URLs temporarily for select menu interactions
const mediaSelectionCache = new Map<string, Array<{ url: string; type: string; label: string }>>();

export async function handleContextMenuCommand(interaction: MessageContextMenuCommandInteraction) {
  const message = interaction.targetMessage;

  // Extract ALL media from message
  const mediaItems: Array<{ url: string; type: string; label: string }> = [];

  // Check attachments
  let attachmentIndex = 1;
  for (const attachment of message.attachments.values()) {
    const validation = MediaService.validateMediaUrl(attachment.url);
    if (validation.valid && validation.type) {
      const filename = attachment.name || 'unknown';
      mediaItems.push({
        url: attachment.url,
        type: validation.type,
        label: `${validation.type.charAt(0).toUpperCase() + validation.type.slice(1)} ${attachmentIndex} - ${filename}`,
      });
      attachmentIndex++;
    }
  }

  // Check embeds
  let embedIndex = 1;
  for (const embed of message.embeds) {
    if (embed.image?.url) {
      const validation = MediaService.validateMediaUrl(embed.image.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.image.url,
          type: validation.type,
          label: `${validation.type.charAt(0).toUpperCase() + validation.type.slice(1)} from embed ${embedIndex}`,
        });
      }
    }
    if (embed.video?.url) {
      const validation = MediaService.validateMediaUrl(embed.video.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.video.url,
          type: validation.type,
          label: `Video from embed ${embedIndex}`,
        });
      }
    }
    if (embed.thumbnail?.url) {
      const validation = MediaService.validateMediaUrl(embed.thumbnail.url);
      if (validation.valid && validation.type) {
        mediaItems.push({
          url: embed.thumbnail.url,
          type: validation.type,
          label: `Thumbnail from embed ${embedIndex}`,
        });
      }
    }
    embedIndex++;
  }

  // If no media found, show error
  if (mediaItems.length === 0) {
    await interaction.reply({
      content: '❌ No media found in this message. Please try a message with an image, GIF, or video.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // If only 1 media item, show modal directly
  if (mediaItems.length === 1) {
    const modal = new ModalBuilder()
      .setCustomId(`save_media_${message.id}_0`)
      .setTitle('Save Media to Tagger');

    const tagsInput = new TextInputBuilder()
      .setCustomId('tags')
      .setLabel('Tags (space or comma separated)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., plumber guh')
      .setRequired(true)
      .setMaxLength(500);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput);
    modal.addComponents(row);

    // Store media URL for modal submit
    mediaSelectionCache.set(`${interaction.user.id}_${message.id}`, mediaItems);

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      mediaSelectionCache.delete(`${interaction.user.id}_${message.id}`);
    }, 15 * 60 * 1000);

    await interaction.showModal(modal);
    return;
  }

  // Multiple media items - show select menu
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

  // Store media items for later
  mediaSelectionCache.set(`${interaction.user.id}_${message.id}`, mediaItems);

  // Auto-cleanup after 15 minutes
  setTimeout(() => {
    mediaSelectionCache.delete(`${interaction.user.id}_${message.id}`);
  }, 15 * 60 * 1000);

  await interaction.reply({
    content: `📎 This message has ${mediaItems.length} media items. Choose which one to save:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

/**
 * Handle select menu interaction when user chooses which media to save
 */
export async function handleMediaSelectMenu(interaction: StringSelectMenuInteraction) {
  const messageId = interaction.customId.replace('select_media_', '');
  const selectedValue = interaction.values[0] || '0';

  // Show modal for tag input
  const modal = new ModalBuilder()
    .setCustomId(`save_media_${messageId}_${selectedValue}`)
    .setTitle('Save Media to Tagger');

  const tagsInput = new TextInputBuilder()
    .setCustomId('tags')
    .setLabel('Tags (space or comma separated)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., plumber guh')
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

export async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  // Extract message ID and media selection from custom ID
  const parts = interaction.customId.replace('save_media_', '').split('_');
  const messageId = parts[0] || '';
  const selectionValue = parts[1] || '0';

  // Get tags from modal
  const tagsInput = interaction.fields.getTextInputValue('tags');
  const tags = TagService.normalizeTags(tagsInput);

  if (tags.length === 0) {
    await interaction.reply({
      content: '❌ No valid tags provided. Tags must be alphanumeric + underscore only.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Get media from cache
    const cacheKey = `${interaction.user.id}_${messageId}`;
    const mediaItems = mediaSelectionCache.get(cacheKey);

    if (!mediaItems) {
      await interaction.reply({
        content: '❌ Session expired. Please try saving the media again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check if saving all or single item
    if (selectionValue === 'all') {
      // Save all media items with the same tags
      const savedMedia = [];

      for (const item of mediaItems) {
        const media = await MediaService.storeMedia({
          mediaUrl: item.url,
          mediaType: item.type,
          tags,
          guildId: interaction.guildId!,
          userId: interaction.user.id,
        });
        savedMedia.push(media);
      }

      // Create confirmation embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`✅ Saved ${savedMedia.length} Media Items`)
        .addFields(
          { name: 'Items', value: savedMedia.length.toString(), inline: true },
          { name: 'Tags', value: tags.join(', '), inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      // Save single item
      const mediaIndex = parseInt(selectionValue);

      if (mediaIndex >= mediaItems.length) {
        await interaction.reply({
          content: '❌ Media not found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const selectedMedia = mediaItems[mediaIndex];
      if (!selectedMedia) {
        await interaction.reply({
          content: '❌ Media not found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const mediaUrl = selectedMedia.url;
      const mediaType = selectedMedia.type;

      // Save media to database
      const media = await MediaService.storeMedia({
        mediaUrl,
        mediaType,
        tags,
        guildId: interaction.guildId!,
        userId: interaction.user.id,
        channelId: interaction.channelId!,
      });

      // Create confirmation embed
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Media Saved Successfully')
        .addFields(
          { name: 'Type', value: mediaType, inline: true },
          { name: 'Tags', value: tags.join(', '), inline: false }
        )
        .setFooter({ text: `ID: ${media.id}` })
        .setTimestamp()
        .setImage(mediaUrl);

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // Clean up cache after successful save
    mediaSelectionCache.delete(cacheKey);
  } catch (error) {
    console.error('Error saving media from context menu:', error);
    await interaction.reply({
      content: '❌ Failed to save media. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * Handle "Reply with Tagger" context menu command
 */
export async function handleReplyContextMenu(interaction: MessageContextMenuCommandInteraction) {
  const targetMessage = interaction.targetMessage;

  // Show modal for tag input
  const modal = new ModalBuilder()
    .setCustomId(`reply_media_${targetMessage.id}`)
    .setTitle('Reply with Tagger');

  const tagsInput = new TextInputBuilder()
    .setCustomId('tags')
    .setLabel('Tags (space or comma separated)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., plumber guh')
    .setRequired(true)
    .setMaxLength(500);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Handle modal submit for "Reply with Tagger"
 */
export async function handleReplyModalSubmit(interaction: ModalSubmitInteraction) {
  // Extract message ID from custom ID
  const messageId = interaction.customId.replace('reply_media_', '');

  // Get tags from modal
  const tagsInput = interaction.fields.getTextInputValue('tags');
  const tags = TagService.normalizeTags(tagsInput);

  if (tags.length === 0) {
    await interaction.reply({
      content: '❌ No valid tags provided. Tags must be alphanumeric + underscore only.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Search for media
    const results = await SearchService.searchByTags(
      interaction.guildId!,
      tags
    );

    if (results.length === 0) {
      await interaction.reply({
        content: `❌ No media found matching tags: ${tags.join(', ')}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Store reply target
    replyTargets.set(interaction.user.id, {
      channelId: interaction.channelId!,
      messageId: messageId,
    });

    // Store recall session
    recallSessions.set(interaction.user.id, results);

    // Show first result with carousel
    const embed = createMediaEmbed(results[0]!, 1, results.length);
    const buttons = createNavigationButtons(1, results.length, 'recall', results[0]!.id);

    await interaction.reply({
      content: `Found ${results.length} result(s) for: ${tags.join(', ')}. Click "Send" to reply.`,
      embeds: [embed],
      components: [buttons],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error in reply with tagger:', error);
    await interaction.reply({
      content: '❌ An error occurred while searching for media.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
