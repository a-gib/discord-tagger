# Stash

A Discord bot for saving and searching media using custom tags.

- Save images, GIFs, and videos from Discord messages
- Tag them with custom labels (e.g., "funny cat", "plumber guh")
- Search and retrieve them later by tags
- Share tagged media in any channel

## Features

### Saving Media

- **Right-click context menu**: "Save to Stash" on any message with media
- **Slash command**: `/save url:<link> tags:<tags>`
- Multi-item support: Save several images from one message
- Auto-detects: Discord attachments, embeds, Tenor/GIPHY links

### Searching & Sending

- **Search by tags**: `/get tags:<tags>` (e.g., `/get tags:plumber guh`)
- Browse results with Previous/Next buttons
- Click "Send" to post to current channel
- **Reply with media**: Right-click any message → "Reply with Stash"

### Other Commands

- **Delete your media**: `/delete tags:<tags>`
- **Server leaderboard**: `/top` shows most-used media
- **Filter by type**: Add `type:image`, `type:gif`, or `type:video` to commands
- **Help**: `/help` explains everything

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL database
- Discord bot token

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# Push database schema
pnpm db:push

# Deploy commands to Discord
pnpm deploy-commands

# Start bot
pnpm start
```

### Environment Variables

```env
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DATABASE_URL=postgresql://user:password@host:5432/database
DEBUG_MODE=false  # Set to 'true' for owner-only debug commands
```

### Bot Permissions

Required Discord permissions:
- Send Messages
- Embed Links
- Attach Files
- Read Message History

## Development

```bash
# Run with hot reload
pnpm dev

# Build TypeScript
pnpm build

# Lint code
pnpm lint

# Format code
pnpm format

# Open database GUI
pnpm db:studio
```

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Discord**: discord.js v14
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Railway (or any Node.js host)
