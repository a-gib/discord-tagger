/**
 * help.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createHelpEmbed } from '../utils/embeds.js';

export async function handleHelpCommand(interaction: ChatInputCommandInteraction) {
  const embed = createHelpEmbed();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
