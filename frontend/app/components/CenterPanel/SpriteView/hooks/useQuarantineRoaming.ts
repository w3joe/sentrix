import { useState, useEffect, useRef } from 'react';
import { quarantineRoom } from '../config/roomLayout';

const S = 3;

// Roaming configuration for aimless wandering in quarantine
const ROAM_SPEED = 0.25 * S; // Slower than normal for aimless wandering
const PAUSE_MIN_MS = 2000; // Minimum pause at each point
const PAUSE_MAX_MS = 5000; // Maximum pause at each point
const MARGIN = 30 * S; // Keep sprites away from room edges

// Quarantine room bounds for roaming
const ROAM_BOUNDS = {
  minX: quarantineRoom.x + MARGIN,
  maxX: quarantineRoom.x + quarantineRoom.width - MARGIN,
  minY: quarantineRoom.y + MARGIN,
  maxY: quarantineRoom.y + quarantineRoom.height - MARGIN,
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

interface Position {
  x: number;
  y: number;
}

/**
 * Makes a suspended agent roam randomly within the quarantine room.
 * When active is true, the agent wanders aimlessly between random points.
 * When active is false, the agent returns to initialX/initialY.
 */
export function useQuarantineRoaming(
  active: boolean,
  initialX: number,
  initialY: number
): Position {
  const [position, setPosition] = useState<Position>({ x: initialX, y: initialY });
  const posRef = useRef<Position>({ x: initialX, y: initialY });
  const targetRef = useRef<Position | null>(null);
  const pauseUntilRef = useRef<number>(0);

  // Reset to initial position when roaming is disabled
  useEffect(() => {
    if (!active) {
      posRef.current = { x: initialX, y: initialY };
      setPosition({ x: initialX, y: initialY });
      targetRef.current = null;
    }
  }, [active, initialX, initialY]);

  useEffect(() => {
    if (!active) return;

    let rafId: number;

    const tick = () => {
      const now = Date.now();
      const cur = posRef.current;

      // If we're pausing, wait
      if (now < pauseUntilRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      // If no target, pick a random point
      if (!targetRef.current) {
        targetRef.current = getRandomRoamPoint();
      }

      const target = targetRef.current;
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < ROAM_SPEED) {
        // Arrived at target — snap, pause, then pick new target
        posRef.current = { x: target.x, y: target.y };
        setPosition({ ...posRef.current });
        targetRef.current = null;
        pauseUntilRef.current = now + getRandomPauseDuration();
      } else {
        // Move toward target at constant speed
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

    // Start with a brief random pause before first movement
    pauseUntilRef.current = Date.now() + Math.random() * 1000;
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [active]);

  return position;
}
