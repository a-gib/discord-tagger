import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from 'discord.js';
import type { MediaRecord } from '../services/media.service.js';

export function createMediaEmbed(
  media: MediaRecord,
  position: number,
  total: number
): EmbedBuilder {
  const emoji =
    media.mediaType === 'gif'
      ? '🎬'
      : media.mediaType === 'video'
        ? '🎥'
        : '🖼️';

  const embed = new EmbedBuilder()
    .setColor(Colors.Blue)
    .setTitle(`${emoji} ${media.mediaType.charAt(0).toUpperCase() + media.mediaType.slice(1)}`)
    .addFields(
      { name: 'Tags', value: media.tags.join(', ') || 'No tags', inline: false },
      { name: 'Owner', value: `<@${media.userId}>`, inline: true },
      { name: 'Type', value: media.mediaType, inline: true },
      { name: 'Uses', value: `${media.recallCount}`, inline: true },
      { name: 'Result', value: `${position} of ${total}`, inline: true }
    )
    .setFooter({ text: `ID: ${media.id}` })
    .setTimestamp(media.createdAt)
    .setImage(media.mediaUrl);

  if (media.fileName) {
    embed.setDescription(`📁 ${media.fileName}`);
  }

  return embed;
}

export function createNavigationButtons(
  position: number,
  total: number,
  mode: 'recall' | 'delete' | 'top',
  mediaId: string
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${mode}_prev_${mediaId}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position === 1)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${mode}_next_${mediaId}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position === total)
  );

  if (mode === 'recall') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`recall_send_${mediaId}`)
        .setLabel('✓ Send')
        .setStyle(ButtonStyle.Success)
    );
  } else if (mode === 'delete') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`delete_confirm_${mediaId}`)
        .setLabel('🗑 Delete')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return row;
}

export function createHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle('📚 Help')
    .setDescription('Save and search using custom tags!')
    .addFields(
      {
        name: '💡 Quick Save',
        value:
          '**Right-click a message → Apps → "Save to Tagger"**',
        inline: false,
      },
      {
        name: '/save',
        value:
          '**Save with tags**\n' +
          'Usage: `/save url:<url> tags:<tags>`\n' +
          'Example: `/save url:https://... tags:plumber guh`',
        inline: false,
      },
      {
        name: '/get',
        value:
          '**Search by tags**\n' +
          'Usage: `/get tags:<tags>`\n' +
          'Example: `/get tags:plumber guh`\n' +
          'Browse results with Previous/Next, click Send to post.',
        inline: false,
      },
      {
        name: '/delete',
        value:
          '**Delete by tags**\n' +
          'Usage: `/delete tags:<tags>`\n' +
          'Example: `/delete tags:plumber guh`\n' +
          'Browse and delete. Only works for your own items (or if you\'re an admin).',
        inline: false,
      },
      {
        name: '/top',
        value:
          '**Show most used**\n' +
          'Usage: `/top` or `/top type:<type>`\n' +
          'Example: `/top type:gif`\n' +
          'Browse the most popular in this server. Public message everyone can see!',
        inline: false,
      },
      {
        name: 'Supported Media Types',
        value:
          '🖼️ Images: .png, .jpg, .jpeg, .webp\n' +
          '🎬 GIFs: .gif\n' +
          '🎥 Videos: .mp4, .mov, .webm',
        inline: false,
      },
      {
        name: 'Tag Rules',
        value:
          '• Lowercase, alphanumeric + underscore only\n' +
          '• Max 50 characters per tag\n' +
          '• Max 20 tags per item\n' +
          '• Spaces and commas separate tags',
        inline: false,
      }
    )
    .setTimestamp();
}
