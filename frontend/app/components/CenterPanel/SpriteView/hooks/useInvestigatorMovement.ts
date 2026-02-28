import { useState, useEffect, useRef } from 'react';
import { getDeskPosition, controlRoom } from '../config/roomLayout';
import { MOVEMENT } from '../config/spriteConfig';

const S = 3;

export function useInvestigatorMovement(
  investigatorId: string,
  targetAgentId: string | null,
  onArrived?: () => void,
) {
  const homePos =
    controlRoom.investigatorPositions.find((p) => p.id === investigatorId) ??
    controlRoom.investigatorPositions[0];

  const [position, setPosition] = useState({ x: homePos.x, y: homePos.y });
  const posRef = useRef(position);
  const arrivedRef = useRef(false);

  useEffect(() => {
    arrivedRef.current = false;
    let rafId: number;

    const tick = () => {
      const cur = posRef.current;
      let targetPos: { x: number; y: number };

      if (targetAgentId) {
        const deskPos = getDeskPosition(targetAgentId);
        targetPos = deskPos ? { x: deskPos.x, y: deskPos.y - 40 * S } : { x: homePos.x, y: homePos.y };
      } else {
        targetPos = { x: homePos.x, y: homePos.y };
      }

      const dx = targetPos.x - cur.x;
      const dy = targetPos.y - cur.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 2 * S) {
        const speed = MOVEMENT.investigatorSpeed;
        const newPos = {
          x: cur.x + dx * speed,
          y: cur.y + dy * speed,
        };
        posRef.current = newPos;
        setPosition(newPos);
      } else if (!arrivedRef.current && targetAgentId) {
        arrivedRef.current = true;
        onArrived?.();
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [targetAgentId, homePos.x, homePos.y, onArrived]);

  return position;
}
