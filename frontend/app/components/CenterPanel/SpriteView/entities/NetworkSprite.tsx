'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS, SPRITE_SHEETS, SPRITE_FRAMES, SPRITE_DISPLAY_SIZES } from '../config/spriteConfig';
import { CharacterSprite } from './BaseCharacter';

interface NetworkSpriteProps {
  x: number;
  y: number;
}

export function NetworkSprite({ x, y }: NetworkSpriteProps) {
  // Pulsing ring effect
  const drawPulse = useCallback((g: any) => {
    g.clear();
    const pulse = Math.sin(Date.now() / 1000) * 0.12 + 0.18;
    g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.network.border, alpha: pulse });
    g.circle(0, 0, 28);
    g.stroke();
    g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.network.border, alpha: pulse * 0.5 });
    g.circle(0, 0, 34);
    g.stroke();
  }, []);

  const drawLabel = useCallback((g: any) => {
    g.clear();
    g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
    g.roundRect(-35, 26, 70, 14, 3);
    g.fill();
  }, []);

  return (
    <pixiContainer x={x} y={y}>
      {/* Pulse rings */}
      <pixiGraphics draw={drawPulse} />

      {/* Body */}
      <CharacterSprite
        sheetPath={SPRITE_SHEETS.network}
        direction={SPRITE_FRAMES.FRONT}
        displaySize={SPRITE_DISPLAY_SIZES.network}
      />

      {/* Label background */}
      <pixiGraphics draw={drawLabel} />

      {/* Label */}
      <pixiText
        text="Network"
        x={0}
        y={33}
        anchor={0.5}
        style={{
          fontSize: 9,
          fill: SYSTEM_COLORS.network.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
