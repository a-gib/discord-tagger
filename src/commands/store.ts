import { ChatInputCommandInteraction, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { MediaService } from '../services/media.service.js';
import { TagService } from '../services/tag.service.js';

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

  const tags = TagService.normalizeTags(tagsInput);
  if (tags.length === 0) {
    await interaction.reply({
      content: '❌ No valid tags provided. Tags must be alphanumeric + underscore only.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    const media = await MediaService.storeMedia({
      mediaUrl: url,
      mediaType: validation.type,
      tags,
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });

    const isGifProvider = url.toLowerCase().includes('tenor.com/view/') ||
                         url.toLowerCase().includes('giphy.com/gifs/');

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('✅ Saved Successfully')
      .addFields(
        { name: 'Type', value: validation.type, inline: true },
        { name: 'Tags', value: tags.join(', '), inline: false }
      )
      .setFooter({ text: `ID: ${media.id}` })
      .setTimestamp();

    if (isGifProvider) {
      embed.setURL(url).setDescription(`[Click to view GIF](${url})`);
    } else {
      embed.setImage(url);
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
