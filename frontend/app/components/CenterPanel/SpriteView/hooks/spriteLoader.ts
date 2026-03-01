'use client';

import { Assets, Texture, Rectangle } from 'pixi.js';
import {
  SPRITE_SHEETS,
  FURNITURE_SPRITES,
  FLOOR_SPRITES,
} from '../config/spriteConfig';

// Shared module-level caches — populated by preload or on-demand
export const frameCache = new Map<string, Texture[]>();
export const textureCache = new Map<string, Texture>();
const loadingPromises = new Map<string, Promise<void>>();

let preloadPromise: Promise<void> | null = null;

function sliceFrames(baseTexture: Texture): Texture[] {
  const source = baseTexture.source;
  const frameWidth = Math.floor(source.width / 4);
  const frameHeight = source.height;
  return [0, 1, 2, 3].map(
    (i) =>
      new Texture({
        source,
        frame: new Rectangle(i * frameWidth, 0, frameWidth, frameHeight),
      }),
  );
}

async function loadWithRetry(
  path: string,
  retries = 1,
  timeoutMs = 5000,
): Promise<Texture> {
  const timeoutPromise = new Promise<Texture>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout loading ${path}`)), timeoutMs)
  );
  const loadWithTimeout = () =>
    Promise.race([Assets.load(path), timeoutPromise]);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await loadWithTimeout();
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 50));
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Failed to load ${path}`);
}

function cachePath(
  path: string,
  tex: Texture,
  spritePathSet: Set<string>,
): void {
  if (spritePathSet.has(path)) {
    frameCache.set(path, sliceFrames(tex));
  } else {
    textureCache.set(path, tex);
  }
}

const PRELOAD_TIMEOUT_MS = 4000;

/**
 * Preload only floor + furniture (5 assets) — fast, shows world structure quickly.
 * Character sprite sheets load on-demand when EntityLayer mounts.
 * Resolves after timeout even if some loads hang — world still renders, assets load on-demand.
 */
export function preloadEssentialSprites(): Promise<void> {
  const essentialPaths = [
    ...Object.values(FLOOR_SPRITES),
    ...Object.values(FURNITURE_SPRITES),
  ];
  const spritePathSet = new Set<string>(Object.values(SPRITE_SHEETS));

  const loadTask = Promise.allSettled(
    essentialPaths.map(async (path) => {
      if (frameCache.has(path) || textureCache.has(path)) return;
      try {
        const tex = await loadWithRetry(path, 0, 3000);
        cachePath(path, tex, spritePathSet);
      } catch (err) {
        console.warn('[spriteLoader] Failed:', path, err);
      }
    }),
  );

  return Promise.race([
    loadTask.then(() => {}),
    new Promise<void>((resolve) =>
      setTimeout(resolve, PRELOAD_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Preload all sprite assets (including character sheets).
 * Use preloadEssentialSprites() for faster first paint — this loads everything.
 */
export function preloadAllSprites(): Promise<void> {
  if (preloadPromise) return preloadPromise;

  const spritePathSet = new Set<string>(Object.values(SPRITE_SHEETS));
  const allPaths = [
    ...Object.values(SPRITE_SHEETS),
    ...Object.values(FURNITURE_SPRITES),
    ...Object.values(FLOOR_SPRITES),
  ];

  preloadPromise = (async () => {
    const uniquePaths = [...new Set(allPaths)];
    const results = await Promise.allSettled(
      uniquePaths.map(async (path) => {
        if (frameCache.has(path) || textureCache.has(path)) return;
        const tex = await loadWithRetry(path);
        cachePath(path, tex, spritePathSet);
      }),
    );

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(
        '[spriteLoader] Some assets failed:',
        failed.map((r) => (r as PromiseRejectedResult).reason?.message ?? r),
      );
    }
  })();

  return preloadPromise;
}

/**
 * Load a single sprite sheet (for on-demand fallback).
 */
export async function loadSpriteSheet(sheetPath: string): Promise<void> {
  if (frameCache.has(sheetPath)) return;
  if (loadingPromises.has(sheetPath)) {
    await loadingPromises.get(sheetPath);
    return;
  }
  const promise = loadWithRetry(sheetPath)
    .then((tex) => {
      frameCache.set(sheetPath, sliceFrames(tex));
      loadingPromises.delete(sheetPath);
    })
    .catch((err) => {
      console.error('[spriteLoader] Failed to load sheet:', sheetPath, err);
      loadingPromises.delete(sheetPath);
      throw err;
    });
  loadingPromises.set(sheetPath, promise);
  await promise;
}

/**
 * Load a single static texture (for on-demand fallback).
 */
export async function loadStaticTexture(path: string): Promise<void> {
  if (textureCache.has(path)) return;
  if (loadingPromises.has(path)) {
    await loadingPromises.get(path);
    return;
  }
  const promise = loadWithRetry(path)
    .then((tex) => {
      textureCache.set(path, tex);
      loadingPromises.delete(path);
    })
    .catch((err) => {
      console.error('[spriteLoader] Failed to load texture:', path, err);
      loadingPromises.delete(path);
      throw err;
    });
  loadingPromises.set(path, promise);
  await promise;
}
