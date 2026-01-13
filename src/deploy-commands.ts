import { REST, Routes, SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Error: DISCORD_TOKEN and DISCORD_CLIENT_ID must be defined in .env file');
  process.exit(1);
}

// Type assertions after validation
const token: string = DISCORD_TOKEN;
const clientId: string = DISCORD_CLIENT_ID;

// Define slash commands
const commands = [
  new SlashCommandBuilder()
    .setName('save')
    .setDescription('Save a media URL with tags')
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
    .setDescription('Get media by searching tags')
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Tags to search for (space or comma-separated)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by media type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete stored media by searching with tags')
    .addStringOption((option) =>
      option
        .setName('tags')
        .setDescription('Tags to search for media to delete (space or comma-separated)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by media type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('top')
    .setDescription('Show the most used media in this server')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('Filter by media type')
        .setRequired(false)
        .addChoices(
          { name: 'Image', value: 'image' },
          { name: 'GIF', value: 'gif' },
          { name: 'Video', value: 'video' }
        )
    ),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show help information about Tagger bot'),

  // Context menu commands
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

// Create REST client and deploy commands
const rest = new REST({ version: '10' }).setToken(token);

async function deployCommands() {
  try {
    console.log(`🚀 Started refreshing ${commands.length} application (/) commands.`);

    // Register commands globally
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
