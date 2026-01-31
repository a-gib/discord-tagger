/**
 * thumbnail.service.ts
 * Stash
 *
 * Created on 01/30/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import { Client, TextChannel } from 'discord.js';
import { spawn } from 'child_process';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';

const MAX_VIDEO_SIZE_MB = 100;
const FFPROBE_TIMEOUT_MS = 10_000;
const FFMPEG_TIMEOUT_MS = 30_000;

class ThumbnailServiceClass {
  private client: Client | null = null;
  private storageChannelId: string | null = null;

  initialize(client: Client): void {
    this.client = client;
    this.storageChannelId = process.env.THUMBNAIL_STORAGE_CHANNEL_ID || null;

    if (this.storageChannelId) {
      console.log('🖼️  Thumbnail service initialized');
    } else {
      console.log('⚠️  Thumbnail service disabled (THUMBNAIL_STORAGE_CHANNEL_ID not set)');
    }
  }

  isEnabled(): boolean {
    return this.client !== null && this.storageChannelId !== null;
  }

  async generateForUrl(videoUrl: string): Promise<string | null> {
    if (!this.isEnabled()) {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Thumbnail service not enabled`);
      }
      return null;
    }

    // Try to refresh expired Discord CDN URLs
    const refreshedUrl = await this.refreshDiscordUrl(videoUrl);
    if (refreshedUrl !== videoUrl && process.env.DEBUG_MODE === 'true') {
      console.log(`[DEBUG] Refreshed Discord URL`);
    }

    const tempDir = path.join(os.tmpdir(), `stash-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const videoPath = path.join(tempDir, 'video');
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');

    try {
      await fs.mkdir(tempDir, { recursive: true });
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Created temp dir: ${tempDir}`);
      }

      // Check file size with HEAD request
      const fileSize = await this.getFileSize(refreshedUrl);
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Video file size: ${fileSize ? Math.round(fileSize / 1024 / 1024) + 'MB' : 'unknown'}`);
      }
      if (fileSize && fileSize > MAX_VIDEO_SIZE_MB * 1024 * 1024) {
        if (process.env.DEBUG_MODE === 'true') {
          console.log(`[DEBUG] Skipping thumbnail: video too large (${Math.round(fileSize / 1024 / 1024)}MB)`);
        }
        return null;
      }

      // Download video
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Downloading video...`);
      }
      await this.downloadFile(refreshedUrl, videoPath);
      if (process.env.DEBUG_MODE === 'true') {
        const stats = await fs.stat(videoPath);
        console.log(`[DEBUG] Downloaded video: ${Math.round(stats.size / 1024 / 1024)}MB`);
      }

      // Get video duration
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Getting video duration...`);
      }
      const duration = await this.getVideoDuration(videoPath);
      if (duration === null) {
        if (process.env.DEBUG_MODE === 'true') {
          console.log(`[DEBUG] Failed to get video duration (ffprobe failed)`);
        }
        return null;
      }
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Video duration: ${duration}s`);
      }

      // Extract frame at 10% into video (min 1 second)
      const seekTime = Math.max(1, duration * 0.1);
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Extracting frame at ${seekTime}s...`);
      }
      await this.extractFrame(videoPath, thumbnailPath, seekTime);
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Frame extracted successfully`);
      }

      // Upload to Discord
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Uploading thumbnail to Discord...`);
      }
      const cdnUrl = await this.uploadToDiscord(thumbnailPath);
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Upload result: ${cdnUrl || 'failed'}`);
      }
      return cdnUrl;
    } catch (error) {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Thumbnail generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return null;
    } finally {
      // Cleanup temp files
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private async refreshDiscordUrl(url: string): Promise<string> {
    const isDiscordCdn = url.includes('cdn.discordapp.com') ||
                         url.includes('media.discordapp.net');
    if (!isDiscordCdn || !this.client || !this.storageChannelId) {
      return url;
    }

    try {
      const channel = await this.client.channels.fetch(this.storageChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        return url;
      }

      // Post URL to trigger Discord to refresh it
      const message = await channel.send(url);

      // Wait for Discord to process the embed
      await new Promise(resolve => setTimeout(resolve, 500));

      // Fetch the message to get the processed embed
      const fetchedMessage = await channel.messages.fetch(message.id);

      // Extract refreshed URL from embed
      const embed = fetchedMessage.embeds[0];
      const refreshedUrl = embed?.video?.url || embed?.url || url;

      // Clean up
      await message.delete().catch(() => {});

      return refreshedUrl;
    } catch (error) {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] Failed to refresh Discord URL: ${error}`);
      }
      return url;
    }
  }

  private async getFileSize(url: string): Promise<number | null> {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      return contentLength ? parseInt(contentLength, 10) : null;
    } catch {
      return null;
    }
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Failed to download: ${response.status}`);
    }

    const fileStream = createWriteStream(destPath);
    await pipeline(response.body, fileStream);
  }

  private getVideoDuration(videoPath: string): Promise<number | null> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath,
      ]);

      let output = '';
      let killed = false;

      const timeout = setTimeout(() => {
        killed = true;
        ffprobe.kill('SIGTERM');
        resolve(null);
      }, FFPROBE_TIMEOUT_MS);

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        clearTimeout(timeout);
        if (killed || code !== 0) {
          resolve(null);
          return;
        }

        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? null : duration);
      });

      ffprobe.on('error', () => {
        clearTimeout(timeout);
        resolve(null);
      });
    });
  }

  private extractFrame(videoPath: string, outputPath: string, seekTime: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-ss', seekTime.toString(),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        '-y',
        outputPath,
      ]);

      let killed = false;

      const timeout = setTimeout(() => {
        killed = true;
        ffmpeg.kill('SIGTERM');
        reject(new Error('FFmpeg timeout'));
      }, FFMPEG_TIMEOUT_MS);

      ffmpeg.on('close', (code) => {
        clearTimeout(timeout);
        if (killed) return;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });

      ffmpeg.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async uploadToDiscord(imagePath: string): Promise<string | null> {
    if (!this.client || !this.storageChannelId) {
      return null;
    }

    try {
      const channel = await this.client.channels.fetch(this.storageChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        console.error('Thumbnail storage channel not found or not a text channel');
        return null;
      }

      const message = await channel.send({
        files: [{ attachment: imagePath, name: 'thumbnail.jpg' }],
      });

      const attachment = message.attachments.first();
      return attachment?.url || null;
    } catch (error) {
      console.error('Failed to upload thumbnail to Discord:', error);
      return null;
    }
  }
}

export const ThumbnailService = new ThumbnailServiceClass();
