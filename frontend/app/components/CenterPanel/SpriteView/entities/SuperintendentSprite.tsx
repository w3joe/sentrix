'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS } from '../config/spriteConfig';
import { useDrawSystemEntity } from './BaseCharacter';
import { controlRoom } from '../config/roomLayout';

export function SuperintendentSprite() {
  const { superintendentPos } = controlRoom;
  const drawBody = useDrawSystemEntity(
    'superintendent',
    SYSTEM_COLORS.superintendent.bg,
    SYSTEM_COLORS.superintendent.border,
  );

  // Pulsing ring effect
  const drawPulse = useCallback((g: any) => {
    g.clear();
    const pulse = Math.sin(Date.now() / 800) * 0.15 + 0.2;
    g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.superintendent.border, alpha: pulse });
    g.circle(0, 0, 32);
    g.stroke();
    g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.superintendent.border, alpha: pulse * 0.5 });
    g.circle(0, 0, 38);
    g.stroke();
  }, []);

  const drawLabel = useCallback((g: any) => {
    g.clear();
    g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
    g.roundRect(-45, 30, 90, 14, 3);
    g.fill();
  }, []);

  // Star badge on the superintendent
  const drawBadge = useCallback((g: any) => {
    g.clear();
    g.setFillStyle({ color: 0xffd700 });
    // Small star
    const cx = 0, cy = -2;
    for (let i = 0; i < 5; i++) {
      const outerAngle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const innerAngle = outerAngle + Math.PI / 5;
      const outerR = 6, innerR = 3;
      if (i === 0) g.moveTo(cx + outerR * Math.cos(outerAngle), cy + outerR * Math.sin(outerAngle));
      else g.lineTo(cx + outerR * Math.cos(outerAngle), cy + outerR * Math.sin(outerAngle));
      g.lineTo(cx + innerR * Math.cos(innerAngle), cy + innerR * Math.sin(innerAngle));
    }
    g.closePath();
    g.fill();
  }, []);

  return (
    <pixiContainer x={superintendentPos.x} y={superintendentPos.y}>
      {/* Pulse rings */}
      <pixiGraphics draw={drawPulse} />

      {/* Body */}
      <pixiGraphics draw={drawBody} />

      {/* Star badge */}
      <pixiGraphics draw={drawBadge} />

      {/* Label background */}
      <pixiGraphics draw={drawLabel} />

      {/* Label */}
      <pixiText
        text="Superintendent"
        x={0}
        y={37}
        anchor={0.5}
        style={{
          fontSize: 9,
          fill: SYSTEM_COLORS.superintendent.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
