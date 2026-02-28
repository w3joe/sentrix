'use client';

import { useState, useEffect, useMemo } from 'react';
import { Assets, Texture, Rectangle } from 'pixi.js';
import type { SpriteDirection } from '../config/spriteConfig';
import { SPRITE_FRAMES } from '../config/spriteConfig';

// Module-level cache: sheetPath -> Texture[] (4 frames)
const frameCache = new Map<string, Texture[]>();
const loadingPromises = new Map<string, Promise<void>>();

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

export function useSpriteTexture(
  sheetPath: string,
  direction: SpriteDirection = SPRITE_FRAMES.FRONT,
): { texture: Texture | null; isLoaded: boolean } {
  const [isLoaded, setIsLoaded] = useState(frameCache.has(sheetPath));

  useEffect(() => {
    if (frameCache.has(sheetPath)) {
      setIsLoaded(true);
      return;
    }

    if (!loadingPromises.has(sheetPath)) {
      const promise = Assets.load(sheetPath).then((texture: Texture) => {
        frameCache.set(sheetPath, sliceFrames(texture));
        loadingPromises.delete(sheetPath);
      });
      loadingPromises.set(sheetPath, promise);
    }

    loadingPromises.get(sheetPath)!.then(() => setIsLoaded(true));
  }, [sheetPath]);

  const texture = useMemo(() => {
    if (!isLoaded) return null;
    const frames = frameCache.get(sheetPath);
    return frames ? frames[direction] : null;
  }, [sheetPath, direction, isLoaded]);

  return { texture, isLoaded };
}
