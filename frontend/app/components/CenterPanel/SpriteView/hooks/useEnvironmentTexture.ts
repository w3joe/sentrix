'use client';

import { useState, useEffect, useMemo } from 'react';
import { Assets, Texture } from 'pixi.js';

const textureCache = new Map<string, Texture>();
const loadingPromises = new Map<string, Promise<Texture>>();

export function useEnvironmentTexture(path: string): { texture: Texture | null; isLoaded: boolean } {
  const [isLoaded, setIsLoaded] = useState(textureCache.has(path));

  useEffect(() => {
    if (textureCache.has(path)) {
      setIsLoaded(true);
      return;
    }

    if (!loadingPromises.has(path)) {
      const promise = Assets.load(path).then((texture: Texture) => {
        textureCache.set(path, texture);
        loadingPromises.delete(path);
        return texture;
      });
      loadingPromises.set(path, promise);
    }

    loadingPromises.get(path)!.then(() => setIsLoaded(true));
  }, [path]);

  const texture = useMemo(() => textureCache.get(path) ?? null, [path, isLoaded]);

  return { texture, isLoaded };
}
