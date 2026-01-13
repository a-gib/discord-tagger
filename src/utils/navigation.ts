/**
 * navigation.ts
 * Stash
 *
 * Created on 01/13/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import type { ButtonInteraction } from 'discord.js';
import { createMediaEmbed, createNavigationButtons } from './embeds.js';
import type { MediaRecord } from '../services/media.service.js';

/**
 * Handles navigation button actions (previous/next) for media carousels.
 *
 * @param interaction - Button interaction to update
 * @param results - Array of media results to navigate through
 * @param action - Navigation action ('prev', 'next', or other custom actions)
 * @param mediaId - Current media ID
 * @param mode - Navigation mode ('recall', 'delete', 'top')
 */
export async function handleNavigation(
  interaction: ButtonInteraction,
  results: MediaRecord[],
  action: string,
  mediaId: string,
  mode: 'recall' | 'delete' | 'top'
): Promise<void> {
  const currentIndex = results.findIndex((m) => m.id === mediaId);
  if (currentIndex === -1) {
    return; // Index not found - let caller handle error
  }

  let newIndex = currentIndex;
  if (action === 'prev') {
    newIndex = Math.max(0, currentIndex - 1);
  } else if (action === 'next') {
    newIndex = Math.min(results.length - 1, currentIndex + 1);
  } else {
    return; // Non-navigation action - let caller handle
  }

  const media = results[newIndex]!;
  const position = newIndex + 1;

  const embed = createMediaEmbed(media, position, results.length);
  const buttons = createNavigationButtons(position, results.length, mode, media.id);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
