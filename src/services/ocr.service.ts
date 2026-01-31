/**
 * ocr.service.ts
 * Stash
 *
 * Created on 01/31/2026
 * Copyright (c) 2026 a-gib. Licensed under the MIT License.
 */

import { createWorker, type Worker } from 'tesseract.js';
import { createWriteStream, promises as fs } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import os from 'os';

const OCR_TIMEOUT_MS = 10_000;
const MAX_IMAGE_SIZE_MB = 10;
const MAX_SUGGESTED_TAGS = 5;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
  'can', 'her', 'was', 'one', 'our', 'out', 'has', 'have',
  'this', 'that', 'with', 'they', 'been', 'from', 'will',
  'what', 'when', 'where', 'which', 'their', 'there', 'would',
  'could', 'should', 'about', 'into', 'more', 'some', 'than',
  'them', 'then', 'these', 'only', 'over', 'such', 'make',
  'like', 'just', 'also', 'back', 'after', 'most', 'made',
  'may', 'way', 'did', 'get', 'got', 'see', 'now', 'come',
  'its', 'being', 'how', 'him', 'his', 'she', 'her', 'who',
]);

class OcrServiceClass {
  private worker: Worker | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the Tesseract worker (lazy, called on first use)
   */
  async initialize(): Promise<void> {
    if (this.worker) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (process.env.DEBUG_MODE === 'true') {
        console.log('[DEBUG] Initializing OCR service...');
      }
      this.worker = await createWorker('eng');
      if (process.env.DEBUG_MODE === 'true') {
        console.log('[DEBUG] OCR service ready');
      }
    })();

    return this.initPromise;
  }

  /**
   * Extract tag suggestions from an image URL
   * Returns empty array on any error (OCR is best-effort)
   */
  async extractTags(imageUrl: string): Promise<string[]> {
    try {
      await this.initialize();
      if (!this.worker) return [];

      const imagePath = await this.downloadImage(imageUrl);
      if (!imagePath) return [];

      try {
        const result = await Promise.race([
          this.worker.recognize(imagePath),
          this.timeout(OCR_TIMEOUT_MS),
        ]);

        if (!result || typeof result === 'symbol') return [];

        const rawText = result.data.text;
        if (process.env.DEBUG_MODE === 'true') {
          console.log(`[DEBUG] OCR raw text: "${rawText.slice(0, 100)}${rawText.length > 100 ? '...' : ''}"`);
        }
        return this.filterToTags(rawText);
      } finally {
        await fs.unlink(imagePath).catch(() => {});
      }
    } catch (error) {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return [];
    }
  }

  /**
   * Download image to temp file for processing
   */
  private async downloadImage(url: string): Promise<string | null> {
    try {
      // Check file size first
      const headResponse = await fetch(url, { method: 'HEAD' });
      const contentLength = headResponse.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        if (process.env.DEBUG_MODE === 'true') {
          console.log(`[DEBUG] OCR skipped: image too large (${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB)`);
        }
        return null;
      }

      const response = await fetch(url);
      if (!response.ok || !response.body) return null;

      const tempPath = path.join(
        os.tmpdir(),
        `stash-ocr-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`
      );

      const fileStream = createWriteStream(tempPath);
      await pipeline(response.body, fileStream);

      return tempPath;
    } catch (error) {
      if (process.env.DEBUG_MODE === 'true') {
        console.log(`[DEBUG] OCR download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      return null;
    }
  }

  /**
   * Filter raw OCR text into useful tag suggestions
   */
  private filterToTags(rawText: string): string[] {
    return rawText
      .toLowerCase()
      // Split on whitespace and punctuation
      .split(/[\s\n\r.,!?;:'"()\[\]{}<>|\\\/\-_@#$%^&*+=~`]+/)
      // Remove empty strings
      .filter(word => word.length > 0)
      // Only alphanumeric + underscore (matches existing tag rules)
      .map(word => word.replace(/[^a-z0-9_]/g, ''))
      // Filter out short words (< 3 chars) - typically noise
      .filter(word => word.length >= 3)
      // Filter out words that are too long
      .filter(word => word.length <= 50)
      // Filter out common stop words
      .filter(word => !STOP_WORDS.has(word))
      // Filter out number-only strings (usually noise)
      .filter(word => !/^\d+$/.test(word))
      // Remove duplicates
      .filter((word, index, arr) => arr.indexOf(word) === index)
      // Limit to first N suggestions
      .slice(0, MAX_SUGGESTED_TAGS);
  }

  private timeout(ms: number): Promise<symbol> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timeout')), ms)
    );
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initPromise = null;
    }
  }
}

export const OcrService = new OcrServiceClass();
