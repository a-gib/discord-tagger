import { Client, GatewayIntentBits, Events, MessageFlags } from 'discord.js';
import dotenv from 'dotenv';
import { handleStoreCommand } from './commands/store.js';
import { handleRecallCommand, handleRecallButton } from './commands/recall.js';
import { handleDeleteCommand, handleDeleteButton } from './commands/delete.js';
import { handleTopCommand, handleTopButton } from './commands/top.js';
import { handleHelpCommand } from './commands/help.js';
import {
  handleContextMenuCommand,
  handleModalSubmit,
  handleMediaSelectMenu,
  handleReplyContextMenu,
  handleReplyModalSubmit,
} from './commands/context-menu.js';
import prisma from './utils/db.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

if (!DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN is not defined in .env file');
  process.exit(1);
}

// Type assertion after validation
const token: string = DISCORD_TOKEN;

// Create Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Ready event - fires when bot successfully connects
client.once('clientReady', () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user?.tag}`);
  console.log(`📊 Currently in ${client.guilds.cache.size} server(s)`);
});

// Interaction event - handles slash commands and buttons
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
      switch (interaction.commandName) {
        case 'save':
          await handleStoreCommand(interaction);
          break;
        case 'get':
          await handleRecallCommand(interaction);
          break;
        case 'delete':
          await handleDeleteCommand(interaction);
          break;
        case 'top':
          await handleTopCommand(interaction);
          break;
        case 'help':
          await handleHelpCommand(interaction);
          break;
      }
    }

    // Handle button interactions
    if (interaction.isButton()) {
      const [mode] = interaction.customId.split('_');

      if (mode === 'recall') {
        await handleRecallButton(interaction);
      } else if (mode === 'delete') {
        await handleDeleteButton(interaction);
      } else if (mode === 'top') {
        await handleTopButton(interaction);
      }
    }

    // Handle context menu commands
    if (interaction.isMessageContextMenuCommand()) {
      if (interaction.commandName === 'Save to Tagger') {
        await handleContextMenuCommand(interaction);
      } else if (interaction.commandName === 'Reply with Tagger') {
        await handleReplyContextMenu(interaction);
      }
    }

    // Handle select menus
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith('select_media_')) {
        await handleMediaSelectMenu(interaction);
      }
    }

    // Handle modal submits
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('save_media_')) {
        await handleModalSubmit(interaction);
      } else if (interaction.customId.startsWith('reply_media_')) {
        await handleReplyModalSubmit(interaction);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);

    // Try to respond with error message
    const errorMessage = '❌ An error occurred while processing your request.';
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }
});

// Error handling
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  try {
    // Destroy Discord client (closes WebSocket)
    await client.destroy();
    console.log('Discord client disconnected');

    // Disconnect Prisma
    await prisma.$disconnect();
    console.log('Database disconnected');

    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle termination signals (Railway sends SIGTERM)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Login to Discord
client.login(token);
