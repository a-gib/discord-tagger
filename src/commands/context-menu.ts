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

const mediaSelectionCache = new Map<string, Array<{ url: string; type: string; label: string; thumbnailUrl?: string }>>();

export async function handleContextMenuCommand(interaction: MessageContextMenuCommandInteraction) {
  const message = interaction.targetMessage;

  const mediaItems: Array<{ url: string; type: string; label: string; thumbnailUrl?: string }> = [];


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

  let embedIndex = 1;
  for (const embed of message.embeds) {
    const isGifProvider = embed.provider?.name === 'Tenor' || embed.provider?.name === 'GIPHY';

    if (isGifProvider && embed.url) {
      mediaItems.push({
        url: embed.url,
        type: 'gif',
        label: `GIF from ${embed.provider?.name}`,
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

  if (mediaItems.length === 0) {
    await interaction.reply({
      content: '❌ Nothing found. Please try a message with an image, GIF, or video.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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

    mediaSelectionCache.set(`${interaction.user.id}_${message.id}`, mediaItems);

    // Auto-cleanup after 15 minutes
    setTimeout(() => {
      mediaSelectionCache.delete(`${interaction.user.id}_${message.id}`);
    }, 15 * 60 * 1000);

    await interaction.showModal(modal);
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
  }, 15 * 60 * 1000);

  await interaction.reply({
    content: `📎 This message has ${mediaItems.length} items. Choose which one to save:`,
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleMediaSelectMenu(interaction: StringSelectMenuInteraction) {
  const messageId = interaction.customId.replace('select_media_', '');
  const selectedValue = interaction.values[0] || '0';

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
  const parts = interaction.customId.replace('save_media_', '').split('_');
  const messageId = parts[0] || '';
  const selectionValue = parts[1] || '0';

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
    const cacheKey = `${interaction.user.id}_${messageId}`;
    const mediaItems = mediaSelectionCache.get(cacheKey);

    if (!mediaItems) {
      await interaction.reply({
        content: '❗ Session expired. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (selectionValue === 'all') {
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

      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle(`✅ Saved ${savedMedia.length} Items`)
        .addFields(
          { name: 'Items', value: savedMedia.length.toString(), inline: true },
          { name: 'Tags', value: tags.join(', '), inline: false }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } else {
      const mediaIndex = parseInt(selectionValue);

      if (mediaIndex >= mediaItems.length) {
        await interaction.reply({
          content: '❌ Nothing found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const selectedMedia = mediaItems[mediaIndex];
      if (!selectedMedia) {
        await interaction.reply({
          content: '❌ Nothing found.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const mediaUrl = selectedMedia.url;
      const mediaType = selectedMedia.type;

      const media = await MediaService.storeMedia({
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
        .setFooter({ text: `ID: ${media.id}` })
        .setTimestamp()
        .setImage(media.thumbnailUrl || mediaUrl);

      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    mediaSelectionCache.delete(cacheKey);
  } catch (error) {
    console.error('Error saving media from context menu:', error);
    await interaction.reply({
      content: '❗ Failed to save. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleReplyContextMenu(interaction: MessageContextMenuCommandInteraction) {
  const targetMessage = interaction.targetMessage;

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

export async function handleReplyModalSubmit(interaction: ModalSubmitInteraction) {
  const messageId = interaction.customId.replace('reply_media_', '');
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
    console.error('Error in reply with tagger:', error);
    await interaction.reply({
      content: '❗ Search failed.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
