# Plan: Delete Sent Tagger Messages

## Overview

Add a "Delete" button to messages sent by Tagger so the original sender or server admins can remove them.

## Current Behavior

When a user sends media via `/get` or "Reply with Tagger":
- Tagger posts a public message with format: `-# Sent by: @user | Tags: tag1, tag2\n<media_url>`
- No way to delete it other than having Discord permissions

## Proposed Solution

Add a small "Delete" button to every message Tagger sends. When clicked:
1. Check if clicker is the original sender OR has Manage Messages permission
2. If authorized, delete the message
3. If not, show ephemeral error

## Implementation Steps

### Step 1: Create Delete Button Component

**File:** `src/utils/embeds.ts`

Add a function to create the delete button:
```typescript
export function createDeleteSentButton(senderId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tagger_delete_${senderId}`)
      .setLabel('Delete')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🗑️')
  );
}
```

### Step 2: Attach Button to Sent Messages

**File:** `src/commands/recall.ts`

Modify the send logic (lines ~130-148) to include the delete button:
```typescript
const deleteButton = createDeleteSentButton(userId);

await interaction.channel.send({
  content: messageContent,
  components: [deleteButton],
  allowedMentions: { parse: [] },
});
```

Same for reply mode.

### Step 3: Handle Delete Button Click

**File:** `src/commands/recall.ts`

Add handler function:
```typescript
export async function handleTaggerDeleteButton(interaction: ButtonInteraction) {
  const senderId = interaction.customId.replace('tagger_delete_', '');

  // Check permissions: original sender OR has Manage Messages
  const hasPermission =
    interaction.user.id === senderId ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages);

  if (!hasPermission) {
    await interaction.reply({
      content: '❌ Only the sender or moderators can delete this.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Delete the message
  await interaction.message.delete();
}
```

### Step 4: Wire Up in index.ts

**File:** `src/index.ts`

Add routing for the new button:
```typescript
} else if (mode === 'tagger') {
  await handleTaggerDeleteButton(interaction);
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/embeds.ts` | Add createDeleteSentButton function |
| `src/commands/recall.ts` | Import button, attach to sends, add handler |
| `src/index.ts` | Route tagger_delete button clicks |

## Verification

1. Use `/get` to send media to a channel
2. Verify "Delete" button appears on the message
3. Click delete as original sender → message should be deleted
4. Click delete as different user without perms → should see error
5. Click delete as admin → message should be deleted
6. Test same for "Reply with Tagger" flow
