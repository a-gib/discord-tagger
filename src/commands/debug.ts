/**
 * debug.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Colors,
  MessageFlags,
} from 'discord.js';
import prisma from '../utils/db.js';
import { recallSessions, replyTargets } from './recall.js';
import { deleteSessions } from './delete.js';
import { topSessions } from './top.js';
import { MediaService } from '../services/media.service.js';
import { BOT_OWNER_ID } from '../constants.js';

const startTime = Date.now();

export async function handleDebugCommand(interaction: ChatInputCommandInteraction) {
  if (!BOT_OWNER_ID) {
    await interaction.reply({
      content: '❌ Debug command is disabled (BOT_OWNER_ID not configured).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== BOT_OWNER_ID) {
    await interaction.reply({
      content: '❌ Owner only.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'stats':
      await handleStats(interaction);
      break;
    case 'health':
      await handleHealth(interaction);
      break;
    case 'purge-guild':
      await handlePurgeGuild(interaction);
      break;
  }
}

async function handleStats(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const totalActive = await prisma.media.count({
      where: { deletedAt: null },
    });

    const totalDeleted = await prisma.media.count({
      where: { deletedAt: { not: null } },
    });

    const mediaByGuild = await prisma.media.groupBy({
      by: ['guildId'],
      where: { deletedAt: null },
      _count: true,
    });

    const allMedia = await prisma.media.findMany({
      where: { deletedAt: null },
      select: { tags: true },
    });

    const tagCounts = new Map<string, number>();
    for (const media of allMedia) {
      for (const tag of media.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => `${tag}: ${count}`)
      .join('\n');

    const totalRecalls = await prisma.media.aggregate({
      where: { deletedAt: null },
      _sum: { recallCount: true },
    });

    const guildBreakdown = mediaByGuild
      .sort((a, b) => b._count - a._count)
      .slice(0, 10)
      .map((g) => `${g.guildId}: ${g._count}`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle('📊 Bot Statistics')
      .addFields(
        { name: 'Total Active Media', value: totalActive.toString(), inline: true },
        { name: 'Total Deleted', value: totalDeleted.toString(), inline: true },
        { name: 'Total Recalls', value: (totalRecalls._sum.recallCount || 0).toString(), inline: true },
        { name: 'Top 10 Tags', value: topTags || 'None', inline: false },
        { name: 'Top 10 Guilds (by media count)', value: guildBreakdown || 'None', inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in debug stats:', error);
    await interaction.editReply({ content: '❗ Failed to fetch stats.' });
  }
}

async function handleHealth(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const uptimeMs = Date.now() - startTime;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeDays = Math.floor(uptimeSeconds / 86400);
    const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
    const uptimeMins = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeSecs = uptimeSeconds % 60;
    const uptimeStr = `${uptimeDays}d ${uptimeHours}h ${uptimeMins}m ${uptimeSecs}s`;

    const memoryUsage = process.memoryUsage();
    const heapUsedMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (memoryUsage.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(2);

    let dbStatus = '❌ Disconnected';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = '✅ Connected';
    } catch {
      dbStatus = '❌ Failed to query';
    }

    const activeSessions =
      recallSessions.size +
      replyTargets.size +
      deleteSessions.size +
      topSessions.size;

    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle('🏥 Bot Health')
      .addFields(
        { name: 'Uptime', value: uptimeStr, inline: false },
        { name: 'Memory (Heap)', value: `${heapUsedMB} MB / ${heapTotalMB} MB`, inline: true },
        { name: 'Memory (RSS)', value: `${rssMB} MB`, inline: true },
        { name: 'Database', value: dbStatus, inline: true },
        { name: 'Active Sessions', value: activeSessions.toString(), inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in debug health:', error);
    await interaction.editReply({ content: '❗ Failed to fetch health status.' });
  }
}

async function handlePurgeGuild(interaction: ChatInputCommandInteraction) {
  try {
    const guildId = interaction.options.getString('guild_id', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let guildName = 'Unknown';
    try {
      const guild = await interaction.client.guilds.fetch(guildId);
      guildName = guild.name;
    } catch {
      // Guild not accessible, keep as Unknown
    }

    const count = await MediaService.purgeGuild(guildId);

    const embed = new EmbedBuilder()
      .setColor(Colors.Orange)
      .setTitle('🗑️ Guild Purged')
      .addFields(
        { name: 'Guild ID', value: guildId, inline: false },
        { name: 'Guild Name', value: guildName, inline: false },
        { name: 'Media Deleted', value: count.toString(), inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in debug purge-guild:', error);
    await interaction.editReply({ content: '❗ Failed to purge guild.' });
  }
}
