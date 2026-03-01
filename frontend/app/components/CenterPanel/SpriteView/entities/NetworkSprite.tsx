'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { SYSTEM_COLORS, SPRITE_SHEETS, SPRITE_FRAMES, SPRITE_DISPLAY_SIZES } from '../config/spriteConfig';
import { CharacterSprite } from './BaseCharacter';
import { controlRoom } from '../config/roomLayout';
import { useMovementDirection } from '../hooks/useMovementDirection';

const S = 3;

// Roaming configuration for Network agent
const ROAM_SPEED = 0.3 * S; // Slightly slower than investigators
const PAUSE_MIN_MS = 2000;
const PAUSE_MAX_MS = 5000;
const MARGIN = 30 * S;

// Control room bounds for roaming
const ROAM_BOUNDS = {
  minX: controlRoom.x + MARGIN,
  maxX: controlRoom.x + controlRoom.width - MARGIN,
  minY: controlRoom.y + MARGIN,
  maxY: controlRoom.y + controlRoom.height - MARGIN,
};

function getRandomRoamPoint(): { x: number; y: number } {
  return {
    x: ROAM_BOUNDS.minX + Math.random() * (ROAM_BOUNDS.maxX - ROAM_BOUNDS.minX),
    y: ROAM_BOUNDS.minY + Math.random() * (ROAM_BOUNDS.maxY - ROAM_BOUNDS.minY),
  };
}

function getRandomPauseDuration(): number {
  return PAUSE_MIN_MS + Math.random() * (PAUSE_MAX_MS - PAUSE_MIN_MS);
}

interface NetworkSpriteProps {
  x: number;
  y: number;
}

export function NetworkSprite({ x: homeX, y: homeY }: NetworkSpriteProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [position, setPosition] = useState({ x: homeX, y: homeY });
  const posRef = useRef({ x: homeX, y: homeY });
  const roamTargetRef = useRef<{ x: number; y: number } | null>(null);
  const pauseUntilRef = useRef<number>(0);

  const direction = useMovementDirection(position.x, position.y);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Roaming movement effect
  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const now = Date.now();
      const cur = posRef.current;

      // If pausing, wait
      if (now < pauseUntilRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // If no roam target, pick a random point
      if (!roamTargetRef.current) {
        roamTargetRef.current = getRandomRoamPoint();
      }

      const roamTarget = roamTargetRef.current;
      const dx = roamTarget.x - cur.x;
      const dy = roamTarget.y - cur.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ROAM_SPEED) {
        // Arrived at roam target - pause then pick new one
        posRef.current = { x: roamTarget.x, y: roamTarget.y };
        setPosition({ ...posRef.current });
        roamTargetRef.current = null;
        pauseUntilRef.current = now + getRandomPauseDuration();
      } else {
        // Move toward roam target at constant speed
        const nx = dx / dist;
        const ny = dy / dist;
        posRef.current = {
          x: cur.x + nx * ROAM_SPEED,
          y: cur.y + ny * ROAM_SPEED,
        };
        setPosition({ ...posRef.current });
      }

      rafId = requestAnimationFrame(tick);
    };

    // Start with a brief random pause before first movement (offset from investigators)
    pauseUntilRef.current = Date.now() + 500 + Math.random() * 1500;
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, []);

  const drawPulse = useCallback((g: any) => {
    g.clear();
    const pulse = isMounted ? Math.sin(Date.now() / 1000) * 0.12 + 0.18 : 0.18;
    g.setStrokeStyle({ width: 1 * S, color: SYSTEM_COLORS.network.border, alpha: pulse });
    g.circle(0, 0, 28 * S);
    g.stroke();
    g.setStrokeStyle({ width: 1 * S, color: SYSTEM_COLORS.network.border, alpha: pulse * 0.5 });
    g.circle(0, 0, 34 * S);
    g.stroke();
  }, [isMounted]);

  const drawLabel = useCallback((g: any) => {
    g.clear();
    g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
    g.roundRect(-35 * S, 26 * S, 70 * S, 14 * S, 3 * S);
    g.fill();
  }, []);

  return (
    <pixiContainer x={position.x} y={position.y}>
      <pixiGraphics draw={drawPulse} />
      <CharacterSprite
        sheetPath={SPRITE_SHEETS.network}
        direction={direction}
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
