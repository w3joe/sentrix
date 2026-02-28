'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS } from '../config/spriteConfig';
import { useDrawSystemEntity } from './BaseCharacter';
import { usePatrolMovement } from '../hooks/usePatrolMovement';

interface PatrolSpriteProps {
  patrolId: string;
  label: string;
}

export function PatrolSprite({ patrolId, label }: PatrolSpriteProps) {
  const position = usePatrolMovement(patrolId);
  const drawBody = useDrawSystemEntity('patrol', SYSTEM_COLORS.patrol.bg, SYSTEM_COLORS.patrol.border);

  const drawLabel = useCallback(
    (g: any) => {
      g.clear();
      g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
      g.roundRect(-25, 22, 50, 14, 3);
      g.fill();
    },
    [],
  );

  // Scan line effect (rotating line)
  const drawScanEffect = useCallback(
    (g: any) => {
      g.clear();
      const angle = (Date.now() / 1000) % (Math.PI * 2);
      g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.patrol.border, alpha: 0.3 });
      g.moveTo(0, 0);
      g.lineTo(Math.cos(angle) * 25, Math.sin(angle) * 25);
      g.stroke();
    },
    [],
  );

  return (
    <pixiContainer x={position.x} y={position.y}>
      {/* Scan effect */}
      <pixiGraphics draw={drawScanEffect} />

      {/* Body */}
      <pixiGraphics draw={drawBody} />

      {/* Label background */}
      <pixiGraphics draw={drawLabel} />

      {/* Label */}
      <pixiText
        text={label}
        x={0}
        y={29}
        anchor={0.5}
        style={{
          fontSize: 9,
          fill: SYSTEM_COLORS.patrol.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
