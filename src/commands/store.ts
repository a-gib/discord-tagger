/**
 * store.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import { ChatInputCommandInteraction, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { MediaService } from '../services/media.service.js';
import { validateTags } from '../utils/validation.js';

export async function handleStoreCommand(interaction: ChatInputCommandInteraction) {
  const url = interaction.options.getString('url', true);
  const tagsInput = interaction.options.getString('tags', true);

  const validation = MediaService.validateMediaUrl(url);
  if (!validation.valid || !validation.type) {
    await interaction.reply({
      content: '❌ Invalid URL. Must be an image, GIF, or video.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const tags = await validateTags(interaction, tagsInput);
  if (!tags) return;

  try {
    const media = await MediaService.storeMedia({
      mediaUrl: url,
      mediaType: validation.type,
      tags,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('✅ Saved Successfully')
      .addFields(
        { name: 'Type', value: validation.type, inline: true },
        { name: 'Tags', value: tags.join(', '), inline: false }
      )
      .setTimestamp()
      .setImage(url);

    // Only show ID when debug mode is enabled
    if (process.env.DEBUG_MODE === 'true') {
      embed.setFooter({ text: `ID: ${media.id}` });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error saving media:', error);
    await interaction.reply({
      content: '❗ Failed to save. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
