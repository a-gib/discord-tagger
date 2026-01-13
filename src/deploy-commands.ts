import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Error: DISCORD_TOKEN and DISCORD_CLIENT_ID must be defined in .env file');
  process.exit(1);
}

const token: string = DISCORD_TOKEN;
const clientId: string = DISCORD_CLIENT_ID;

const commands = [
  new SlashCommandBuilder()
    .setName('save')
    .setDescription('Save with URL and tags')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('URL of the image/gif/video')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Space or comma-separated tags (e.g., plumber guh)')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('get')
    .setDescription('Search by tags')
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Tags to search for (space or comma-separated)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete by searching tags')
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Tags to search for media to delete (space or comma-separated)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show most used in this server')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Explain how to use Tagger'),

  new ContextMenuCommandBuilder()
    .setName('Save to Tagger')
    .setType(ApplicationCommandType.Message),

  new ContextMenuCommandBuilder()
    .setName('Reply with Tagger')
    .setType(ApplicationCommandType.Message),

  new ContextMenuCommandBuilder()
    .setName('Delete Tagger Message')
    .setType(ApplicationCommandType.Message),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  try {
    console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

    const data = await rest.put(Routes.applicationCommands(clientId), {
      body: commands,
    });

    console.log(
      `✅ Successfully reloaded ${(data as unknown[]).length} application (/) commands.`
    );
  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
}

deployCommands();
