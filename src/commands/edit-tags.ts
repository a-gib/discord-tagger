/**
 * edit-tags.ts
 * Stash
 *
 * Created on 01/29/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import {
  ButtonInteraction,
  ModalSubmitInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} from 'discord.js';
import { MediaService } from '../services/media.service.js';
import { TagService } from '../services/tag.service.js';
import { TAG_INPUT_MAX_LENGTH } from '../constants.js';
import { recallSessions } from './recall.js';
import { topSessions } from './top.js';

function createEditTagsModal(mediaId: string, currentTags: string[]): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`edit_tags_modal_${mediaId}`)
    .setTitle('Edit Tags');

  const tagsInput = new TextInputBuilder()
    .setCustomId('tags')
    .setLabel('Tags (space or comma separated)')
    .setStyle(TextInputStyle.Short)
    .setValue(currentTags.join(' ')) // Pre-fill with current tags
    .setPlaceholder('e.g., plumber guh saria')
    .setRequired(true)
    .setMaxLength(TAG_INPUT_MAX_LENGTH);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(tagsInput);
  modal.addComponents(row);

  return modal;
}

export async function handleEditTagsButton(interaction: ButtonInteraction) {
  const userId = interaction.user.id;
  const [mode] = interaction.customId.split('_');

  // Get results from appropriate session based on mode
  let results;
  if (mode === 'recall') {
    results = recallSessions.get(userId);
  } else if (mode === 'top') {
    const messageId = interaction.message?.id;
    if (!messageId) {
      await interaction.reply({
        content: '❗ Invalid interaction.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    results = topSessions.get(messageId);
  }

  if (!results) {
    await interaction.reply({
      content: '❗ Session expired. Please run the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parts = interaction.customId.split('_');
  const mediaId = parts[2];
  if (!mediaId) {
    await interaction.reply({
      content: '❗ Invalid interaction.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const media = results.find((m) => m.id === mediaId);

  if (!media) {
    await interaction.reply({
      content: '❗ Media not found in session.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = createEditTagsModal(mediaId, media.tags);
  await interaction.showModal(modal);
}

export async function handleEditTagsModalSubmit(interaction: ModalSubmitInteraction) {
  const mediaId = interaction.customId.replace('edit_tags_modal_', '');
  const userId = interaction.user.id;

  // Try to find results in either recall or top sessions
  let results = recallSessions.get(userId);

  if (!results && interaction.message) {
    results = topSessions.get(interaction.message.id);
  }

  if (!results) {
    await interaction.reply({
      content: '❗ Session expired. Please run the command again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const mediaIndex = results.findIndex((m) => m.id === mediaId);
  if (mediaIndex === -1) {
    await interaction.reply({
      content: '❗ Media not found.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tagsInput = interaction.fields.getTextInputValue('tags') || '';
  const newTags = TagService.normalizeTags(tagsInput);

  if (newTags.length === 0) {
    await interaction.reply({
      content: '❌ Cannot remove all tags! Media items must have at least one tag.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Get current tags to show what changed
    const oldTags = results[mediaIndex]!.tags;

    // Update tags in database - anyone can edit tags
    const updatedMedia = await MediaService.updateTags(
      mediaId,
      userId,
      true, // Allow all users to edit
      newTags,
      []
    );

    if (!updatedMedia) {
      await interaction.reply({
        content: '❗ Failed to update tags.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Update the session
    results[mediaIndex] = updatedMedia;

    // Build response showing changes
    const added = newTags.filter((tag) => !oldTags.includes(tag));
    const removed = oldTags.filter((tag) => !newTags.includes(tag));

    let responseMsg = '**Tags Updated!**\n\n';
    if (added.length > 0) {
      responseMsg += `✅ Added: ${added.join(', ')}\n`;
    }
    if (removed.length > 0) {
      responseMsg += `🗑️ Removed: ${removed.join(', ')}\n`;
    }
    if (added.length === 0 && removed.length === 0) {
      responseMsg += 'ℹ️ No changes made\n';
    }

    responseMsg += `\n**New tags**: ${newTags.join(', ')}`;
    responseMsg += '\n\n✅ Navigate in your browse results to see the updated tags.';

    await interaction.reply({
      content: responseMsg,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error updating tags:', error);

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
