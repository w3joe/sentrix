import { useState, useEffect, useRef } from 'react';
import { patrolWaypoints, getDeskPosition } from '../config/roomLayout';
import { MOVEMENT } from '../config/spriteConfig';

const S = 3;

// Slow constant speed in pixels per frame (~60fps) — scaled with world ×3
const PATROL_SPEED = 0.8 * 3;

export function usePatrolTargetMovement(
  patrolId: string,
  targetAgentId: string | null,
  onArrived?: () => void,
) {
  // p1 starts at waypoint 0, p2 starts halfway through the route
  const startIdx = patrolId === 'p1' ? 0 : Math.floor(patrolWaypoints.length / 2);

  const [position, setPosition] = useState(() => ({ ...patrolWaypoints[startIdx] }));
  const posRef = useRef({ ...patrolWaypoints[startIdx] });
  const waypointIdxRef = useRef(startIdx);
  const arrivedRef = useRef(false);
  
  // Use refs for values that the animation loop needs to see updated immediately
  const targetAgentIdRef = useRef<string | null>(targetAgentId);
  const onArrivedRef = useRef(onArrived);

  // Keep refs in sync with props
  useEffect(() => {
    console.log('[usePatrolTargetMovement] targetAgentId changed:', { patrolId, targetAgentId });
    targetAgentIdRef.current = targetAgentId;
    // Reset arrived flag when target changes
    if (targetAgentId) {
      arrivedRef.current = false;
    }
  }, [targetAgentId, patrolId]);

  useEffect(() => {
    onArrivedRef.current = onArrived;
  }, [onArrived]);

  useEffect(() => {
    let rafId: number;

    const tick = () => {
      const cur = posRef.current;
      const currentTarget = targetAgentIdRef.current;

      if (currentTarget) {
        // Moving to target agent
        const deskPos = getDeskPosition(currentTarget);
        const targetPos = deskPos ? { x: deskPos.x, y: deskPos.y - 40 * S } : cur;

        const dx = targetPos.x - cur.x;
        const dy = targetPos.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 2 * S) {
          // Use investigator speed when moving to target for a faster walk
          const speed = MOVEMENT.investigatorSpeed;
          const newPos = {
            x: cur.x + dx * speed,
            y: cur.y + dy * speed,
          };
          posRef.current = newPos;
          setPosition(newPos);
        } else if (!arrivedRef.current) {
          arrivedRef.current = true;
          onArrivedRef.current?.();
        }
      } else {
        // Normal patrol waypoint movement
        const targetIdx = (waypointIdxRef.current + 1) % patrolWaypoints.length;
        const target = patrolWaypoints[targetIdx];

        const dx = target.x - cur.x;
        const dy = target.y - cur.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PATROL_SPEED) {
          // Arrived at waypoint — snap and advance to next
          posRef.current = { x: target.x, y: target.y };
          waypointIdxRef.current = targetIdx;
        } else {
          // Move at constant speed toward the target
          const nx = dx / dist;
          const ny = dy / dist;
          posRef.current = {
            x: cur.x + nx * PATROL_SPEED,
            y: cur.y + ny * PATROL_SPEED,
          };
        }
        setPosition({ ...posRef.current });
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []); // Empty deps - animation loop runs once, reads from refs

  return position;
}
