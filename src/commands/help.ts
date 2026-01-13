import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { createHelpEmbed } from '../utils/embeds.js';

export async function handleHelpCommand(interaction: ChatInputCommandInteraction) {
  const embed = createHelpEmbed();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
