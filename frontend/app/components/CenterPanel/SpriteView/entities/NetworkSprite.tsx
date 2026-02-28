'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS, SPRITE_SHEETS, SPRITE_FRAMES, SPRITE_DISPLAY_SIZES } from '../config/spriteConfig';
import { CharacterSprite } from './BaseCharacter';

const S = 3;

interface NetworkSpriteProps {
  x: number;
  y: number;
}

export function NetworkSprite({ x, y }: NetworkSpriteProps) {
  const drawPulse = useCallback((g: any) => {
    g.clear();
    const pulse = Math.sin(Date.now() / 1000) * 0.12 + 0.18;
    g.setStrokeStyle({ width: 1 * S, color: SYSTEM_COLORS.network.border, alpha: pulse });
    g.circle(0, 0, 28 * S);
    g.stroke();
    g.setStrokeStyle({ width: 1 * S, color: SYSTEM_COLORS.network.border, alpha: pulse * 0.5 });
    g.circle(0, 0, 34 * S);
    g.stroke();
  }, []);

  const drawLabel = useCallback((g: any) => {
    g.clear();
    g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
    g.roundRect(-35 * S, 26 * S, 70 * S, 14 * S, 3 * S);
    g.fill();
  }, []);

  return (
    <pixiContainer x={x} y={y}>
      <pixiGraphics draw={drawPulse} />
      <CharacterSprite
        sheetPath={SPRITE_SHEETS.network}
        direction={SPRITE_FRAMES.FRONT}
        displaySize={SPRITE_DISPLAY_SIZES.network}
      />
      <pixiGraphics draw={drawLabel} />
      <pixiText
        text="Network"
        x={0}
        y={33 * S}
        anchor={0.5}
        style={{
          fontSize: 9 * S,
          fill: SYSTEM_COLORS.network.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
