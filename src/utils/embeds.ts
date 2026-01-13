import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Colors,
} from 'discord.js';
import type { MediaRecord } from '../services/media.service.js';

/**
 * Create a Discord embed for displaying media
 */
export function createMediaEmbed(
  media: MediaRecord,
  position: number,
  total: number
): EmbedBuilder {
  // Choose emoji based on media type
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

/**
 * Create navigation buttons for carousel
 * mode: 'recall' | 'delete' | 'top'
 */
export function createNavigationButtons(
  position: number,
  total: number,
  mode: 'recall' | 'delete' | 'top',
  mediaId: string
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  // Previous button (disabled if at first item)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${mode}_prev_${mediaId}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position === 1)
  );

  // Next button (disabled if at last item)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${mode}_next_${mediaId}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(position === total)
  );

  // Action button (Send or Delete) - only for recall and delete modes
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
  // For 'top' mode, no action button

  return row;
}

/**
 * Create help embed
 */
export function createHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(Colors.Gold)
    .setTitle('📚 Help')
    .setDescription('Save and get media using custom tags!')
    .addFields(
      {
        name: '💡 Quick Save',
        value:
          '**Right-click any message with media → Apps → "Save to Tagger"**\n' +
          'The easiest way to save! No need to copy URLs.',
        inline: false,
      },
      {
        name: '/save',
        value:
          '**Save media with tags**\n' +
          'Usage: `/save url:<url> tags:<tags>`\n' +
          'Example: `/save url:https://... tags:plumber guh`',
        inline: false,
      },
      {
        name: '/get',
        value:
          '**Get media by searching tags**\n' +
          'Usage: `/get tags:<tags>`\n' +
          'Example: `/get tags:plumber guh`\n' +
          'Browse results with Previous/Next, click Send to post.',
        inline: false,
      },
      {
        name: '/delete',
        value:
          '**Delete stored media**\n' +
          'Usage: `/delete tags:<tags>`\n' +
          'Example: `/delete tags:plumber guh`\n' +
          'Browse results and click Delete to remove. Only works for your own media (or if you\'re an admin).',
        inline: false,
      },
      {
        name: '/top',
        value:
          '**Show most used media**\n' +
          'Usage: `/top` or `/top type:<type>`\n' +
          'Example: `/top type:gif`\n' +
          'Browse the most popular media in this server. Public message everyone can see!',
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
          '• Max 20 tags per media\n' +
          '• Spaces and commas separate tags',
        inline: false,
      }
    )
    .setTimestamp();
}
