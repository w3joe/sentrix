'use client';

import { useCallback } from 'react';
import { SYSTEM_COLORS } from '../config/spriteConfig';
import { useDrawSystemEntity } from './BaseCharacter';
import { useInvestigatorMovement } from '../hooks/useInvestigatorMovement';
import type { InvestigatorSelection } from '../../../../types';

interface InvestigatorSpriteProps {
  investigatorId: string;
  label: string;
  targetAgentId: string | null;
  targetAgentPos: { x: number; y: number } | null;
  onSelect: (selection: InvestigatorSelection | null) => void;
  onArrived: () => void;
}

export function InvestigatorSprite({
  investigatorId,
  label,
  targetAgentId,
  targetAgentPos,
  onSelect,
  onArrived,
}: InvestigatorSpriteProps) {
  const position = useInvestigatorMovement(investigatorId, targetAgentId, onArrived);
  const drawBody = useDrawSystemEntity(
    'investigator',
    SYSTEM_COLORS.investigator.bg,
    SYSTEM_COLORS.investigator.border,
  );

  const drawLabel = useCallback(
    (g: any) => {
      g.clear();
      g.setFillStyle({ color: 0x0a0e1a, alpha: 0.8 });
      g.roundRect(-35, 24, 70, 14, 3);
      g.fill();
    },
    [],
  );

  // Dashed line to target when assigned
  const drawConnectionLine = useCallback(
    (g: any) => {
      g.clear();
      if (!targetAgentPos) return;

      const dx = targetAgentPos.x - position.x;
      const dy = targetAgentPos.y - position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.floor(dist / 10);

      g.setStrokeStyle({ width: 1, color: SYSTEM_COLORS.investigator.border, alpha: 0.5 });
      for (let i = 0; i < segments; i += 2) {
        const t1 = i / segments;
        const t2 = Math.min((i + 1) / segments, 1);
        g.moveTo(dx * t1, dy * t1);
        g.lineTo(dx * t2, dy * t2);
      }
      g.stroke();
    },
    [targetAgentPos, position.x, position.y],
  );

  const handleClick = useCallback(() => {
    onSelect({ investigatorId, investigatorLabel: label });
  }, [onSelect, investigatorId, label]);

  return (
    <pixiContainer x={position.x} y={position.y}>
      {/* Connection line to target */}
      <pixiGraphics draw={drawConnectionLine} />

      {/* Body */}
      <pixiGraphics
        draw={drawBody}
        eventMode="static"
        cursor="pointer"
        onTap={handleClick}
        onClick={handleClick}
      />

      {/* Label background */}
      <pixiGraphics draw={drawLabel} />

      {/* Label */}
      <pixiText
        text={label}
        x={0}
        y={31}
        anchor={0.5}
        style={{
          fontSize: 9,
          fill: SYSTEM_COLORS.investigator.text,
          fontFamily: 'monospace',
        }}
      />
    </pixiContainer>
  );
}
