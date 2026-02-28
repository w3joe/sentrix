'use client';

import { useState, useEffect } from 'react';
import { Assets, Texture } from 'pixi.js';

const textureCache = new Map<string, Texture>();
const loadingPromises = new Map<string, Promise<void>>();

export function useStaticTexture(path: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(
    textureCache.get(path) ?? null,
  );

  useEffect(() => {
    if (textureCache.has(path)) {
      setTexture(textureCache.get(path)!);
      return;
    }

    if (!loadingPromises.has(path)) {
      const promise = Assets.load(path).then((tex: Texture) => {
        textureCache.set(path, tex);
        loadingPromises.delete(path);
      });
      loadingPromises.set(path, promise);
    }

    loadingPromises.get(path)!.then(() => {
      setTexture(textureCache.get(path)!);
    });
  }, [path]);

  return texture;
}
