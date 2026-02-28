'use client';

import { useCallback, useMemo } from 'react';
import type { AgentStatus } from '../../../../types';
import { STATUS_COLORS, SIZES } from '../config/spriteConfig';
import { useDrawCharacter } from './BaseCharacter';
import { useAgentMovement } from '../hooks/useAgentMovement';

interface AgentSpriteProps {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
}

export function AgentSprite({
  agentId,
  name,
  role,
  status,
  x,
  y,
  isSelected,
  onSelect,
}: AgentSpriteProps) {
  const colors = STATUS_COLORS[status];
  const drawBody = useDrawCharacter(role, colors.bg, colors.border);

  // Animate position transitions (desk ↔ quarantine)
  const animatedPos = useAgentMovement(x, y);

  // Shake offset for critical agents
  const shakeX = status === 'critical' ? Math.sin(Date.now() / 50) * 3 : 0;

  const drawAura = useCallback(
    (g: any) => {
      g.clear();
      if (status === 'critical' || status === 'warning') {
        const alpha = status === 'critical'
          ? 0.2 + Math.sin(Date.now() / 200) * 0.15
          : 0.1 + Math.sin(Date.now() / 500) * 0.05;
        const radius = status === 'critical'
          ? SIZES.auraRadius + Math.sin(Date.now() / 300) * 5
          : SIZES.auraRadius;
        g.setFillStyle({ color: colors.border, alpha });
        g.circle(0, 0, radius);
        g.fill();
      }
    },
    [status, colors.border],
  );

  const drawSelection = useCallback(
    (g: any) => {
      g.clear();
      if (!isSelected) return;
      g.setStrokeStyle({ width: 2, color: 0x00d4ff });
      g.circle(0, 0, SIZES.selectionRingRadius);
      g.stroke();
      // Outer glow
      g.setStrokeStyle({ width: 1, color: 0x00d4ff, alpha: 0.3 });
      g.circle(0, 0, SIZES.selectionRingRadius + 4);
      g.stroke();
    },
    [isSelected],
  );

  const drawAlert = useCallback(
    (g: any) => {
      g.clear();
      if (status !== 'critical' && status !== 'warning') return;
      const bounce = Math.sin(Date.now() / 300) * 3;
      const iconColor = status === 'critical' ? 0xff3355 : 0xffaa00;

      // Warning triangle
      g.setFillStyle({ color: iconColor });
      g.moveTo(0, -38 + bounce);
      g.lineTo(-5, -28 + bounce);
      g.lineTo(5, -28 + bounce);
      g.closePath();
      g.fill();

      // Exclamation line
      g.setFillStyle({ color: 0x0a0e1a });
      g.rect(-1, -36 + bounce, 2, 4);
      g.fill();
      g.rect(-1, -31 + bounce, 2, 2);
      g.fill();
    },
    [status],
  );

  const handleClick = useCallback(() => {
    onSelect(agentId);
  }, [onSelect, agentId]);

  // Short display name
  const displayName = useMemo(() => {
    const parts = name.split('-');
    return parts.length > 1 ? `${parts[0]}-${parts[parts.length - 1]}` : name;
  }, [name]);

  const drawNameLabel = useCallback(
    (g: any) => {
      g.clear();
      // Name background
      const labelWidth = displayName.length * 6 + 8;
      g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
      g.roundRect(-labelWidth / 2, 28, labelWidth, 16, 3);
      g.fill();
    },
    [displayName],
  );

  return (
    <pixiContainer
      x={animatedPos.x + shakeX}
      y={animatedPos.y}
      eventMode="static"
      cursor="pointer"
      onTap={handleClick}
      onClick={handleClick}
    >
      {/* Aura effect */}
      <pixiGraphics draw={drawAura} />

      {/* Selection ring */}
      <pixiGraphics draw={drawSelection} />

      {/* Character body */}
      <pixiGraphics draw={drawBody} />

      {/* Alert icon */}
      <pixiGraphics draw={drawAlert} />

      {/* Name label background */}
      <pixiGraphics draw={drawNameLabel} />

      {/* Name text */}
      <pixiText
        text={displayName}
        x={0}
        y={36}
        anchor={0.5}
        style={{
          fontSize: 10,
          fill: colors.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
