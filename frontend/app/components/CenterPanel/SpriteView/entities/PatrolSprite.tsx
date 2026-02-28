'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS, SPRITE_SHEETS, SPRITE_DISPLAY_SIZES } from '../config/spriteConfig';
import { CharacterSprite } from './BaseCharacter';
import { usePatrolMovement } from '../hooks/usePatrolMovement';
import { useMovementDirection } from '../hooks/useMovementDirection';

const S = 3;

interface PatrolSpriteProps {
  patrolId: string;
  label: string;
}

export function PatrolSprite({ patrolId, label }: PatrolSpriteProps) {
  const position = usePatrolMovement(patrolId);
  const direction = useMovementDirection(position.x, position.y);

  const drawLabel = useCallback(
    (g: any) => {
      g.clear();
      g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
      g.roundRect(-25 * S, 22 * S, 50 * S, 14 * S, 3 * S);
      g.fill();
    },
    [],
  );

  const drawScanEffect = useCallback(
    (g: any) => {
      g.clear();
      const angle = (Date.now() / 1000) % (Math.PI * 2);
      g.setStrokeStyle({ width: 1 * S, color: SYSTEM_COLORS.patrol.border, alpha: 0.3 });
      g.moveTo(0, 0);
      g.lineTo(Math.cos(angle) * 25 * S, Math.sin(angle) * 25 * S);
      g.stroke();
    },
    [],
  );

  return (
    <pixiContainer x={position.x} y={position.y}>
      <pixiGraphics draw={drawScanEffect} />
      <CharacterSprite
        sheetPath={SPRITE_SHEETS.patrol}
        direction={direction}
        displaySize={SPRITE_DISPLAY_SIZES.patrol}
      />
      <pixiGraphics draw={drawLabel} />
      <pixiText
        text={label}
        x={0}
        y={29 * S}
        anchor={0.5}
        style={{
          fontSize: 9 * S,
          fill: SYSTEM_COLORS.patrol.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
