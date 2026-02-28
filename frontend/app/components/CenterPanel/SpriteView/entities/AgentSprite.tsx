'use client';

import { useCallback, useMemo, useState } from 'react';
import type { AgentStatus, RiskLevel, AgentRecord, AgentActivityStatus } from '../../../../types';
import { STATUS_COLORS, SIZES, SPRITE_SHEETS, RISK_SPRITE_MAP, SPRITE_DISPLAY_SIZES } from '../config/spriteConfig';
import { CharacterSprite } from './BaseCharacter';
import { useAgentMovement } from '../hooks/useAgentMovement';
import { useMovementDirection } from '../hooks/useMovementDirection';

interface AgentSpriteProps {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus;
  riskScore: RiskLevel;
  record: AgentRecord;
  activityStatus: AgentActivityStatus;
  x: number;
  y: number;
  isSelected: boolean;
  onSelect: (agentId: string) => void;
}

const ROLE_LABELS: Record<string, string> = {
  EMAIL_AGENT: 'Email',
  CODING_AGENT: 'Coding',
  DOCUMENT_AGENT: 'Document',
  DATA_QUERY_AGENT: 'Data Query',
};

const ACTIVITY_COLORS: Record<AgentActivityStatus, number> = {
  idle: 0x6b7280,
  working: 0x22c55e,
  interacting: 0x3b82f6,
};

export function AgentSprite({
  agentId,
  name,
  role,
  status,
  riskScore,
  record,
  activityStatus,
  x,
  y,
  isSelected,
  onSelect,
}: AgentSpriteProps) {
  const colors = STATUS_COLORS[status];
  const [isHovered, setIsHovered] = useState(false);

  // Animate position transitions (desk <-> quarantine)
  const animatedPos = useAgentMovement(x, y);

  // Determine sprite direction from movement
  const direction = useMovementDirection(animatedPos.x, animatedPos.y);

  // Select sprite: suspended -> restricted, otherwise based on riskScore
  const spriteSheet = status === 'suspended'
    ? SPRITE_SHEETS.restricted
    : SPRITE_SHEETS[RISK_SPRITE_MAP[riskScore]];

  // No shake — removed (was tied to 'critical' which no longer exists)
  const shakeX = 0;

  const drawAura = useCallback(
    (g: any) => {
      g.clear();
      if (status === 'restricted') {
        // Pulsing orange aura for restricted agents
        const alpha = 0.1 + Math.sin(Date.now() / 500) * 0.05;
        g.setFillStyle({ color: colors.border, alpha });
        g.circle(0, 0, SIZES.auraRadius);
        g.fill();
      } else if (status === 'working') {
        // Subtle green aura for actively working agents
        g.setFillStyle({ color: colors.border, alpha: 0.08 });
        g.circle(0, 0, SIZES.auraRadius);
        g.fill();
      } else if (status === 'idle') {
        // Dim blue aura for idle agents
        g.setFillStyle({ color: colors.border, alpha: 0.05 });
        g.circle(0, 0, SIZES.auraRadius);
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
      if (status !== 'restricted') return;
      const bounce = Math.sin(Date.now() / 300) * 3;

      // Warning triangle (orange for restricted)
      g.setFillStyle({ color: 0xffaa00 });
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

  const handlePointerOver = useCallback(() => setIsHovered(true), []);
  const handlePointerOut = useCallback(() => setIsHovered(false), []);

  // Short display name
  const displayName = useMemo(() => {
    const parts = name.split('-');
    return parts.length > 1 ? `${parts[0]}-${parts[parts.length - 1]}` : name;
  }, [name]);

  const drawNameLabel = useCallback(
    (g: any) => {
      g.clear();
      const labelWidth = displayName.length * 6 + 8;
      g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
      g.roundRect(-labelWidth / 2, 28, labelWidth, 16, 3);
      g.fill();
    },
    [displayName],
  );

  // Tooltip data
  const roleLabel = ROLE_LABELS[role] || role;
  const tooltipLines = useMemo(() => [
    agentId,
    `Record: ${record}`,
    `Role: ${roleLabel}`,
    `Status: ${activityStatus}`,
  ], [agentId, record, roleLabel, activityStatus]);

  const tooltipWidth = 130;
  const tooltipLineHeight = 14;
  const tooltipPadding = 8;
  const tooltipHeight = tooltipLines.length * tooltipLineHeight + tooltipPadding * 2;

  const drawTooltipBg = useCallback(
    (g: any) => {
      g.clear();
      if (!isHovered) return;
      g.setFillStyle({ color: 0x111827, alpha: 0.95 });
      g.setStrokeStyle({ width: 1, color: 0x374151 });
      g.roundRect(-tooltipWidth / 2, -tooltipHeight - 30, tooltipWidth, tooltipHeight, 5);
      g.fill();
      g.stroke();
    },
    [isHovered, tooltipWidth, tooltipHeight],
  );

  return (
    <pixiContainer
      x={animatedPos.x + shakeX}
      y={animatedPos.y}
      eventMode="static"
      cursor="pointer"
      onTap={handleClick}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Aura effect */}
      <pixiGraphics draw={drawAura} />

      {/* Selection ring */}
      <pixiGraphics draw={drawSelection} />

      {/* Character body */}
      <CharacterSprite
        sheetPath={spriteSheet}
        direction={direction}
        displaySize={SPRITE_DISPLAY_SIZES.agent}
      />

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

      {/* Hover tooltip */}
      {isHovered && (
        <>
          <pixiGraphics draw={drawTooltipBg} />
          {tooltipLines.map((line, i) => (
            <pixiText
              key={i}
              text={line}
              x={0}
              y={-tooltipHeight - 30 + tooltipPadding + i * tooltipLineHeight + 2}
              anchor={{ x: 0.5, y: 0 }}
              style={{
                fontSize: 10,
                fill: i === 0 ? '#ffffff' : i === 3 ? ACTIVITY_COLORS[activityStatus] : '#9ca3af',
                fontFamily: 'monospace',
                fontWeight: i === 0 ? 'bold' : 'normal',
              }}
            />
          ))}
        </>
      )}
    </pixiContainer>
  );
}
