'use client';

import { useCallback } from 'react';
import { ROLE_COLORS, SIZES } from '../config/spriteConfig';

type ShapeType = 'circle' | 'hexagon' | 'diamond' | 'square';

const ROLE_SHAPES: Record<string, ShapeType> = {
  EMAIL_AGENT: 'circle',
  CODING_AGENT: 'square',
  DOCUMENT_AGENT: 'diamond',
  DATA_QUERY_AGENT: 'hexagon',
};

function drawHexagon(g: any, x: number, y: number, radius: number) {
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const px = x + radius * Math.cos(angle);
    const py = y + radius * Math.sin(angle);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
}

function drawDiamond(g: any, x: number, y: number, size: number) {
  g.moveTo(x, y - size);
  g.lineTo(x + size, y);
  g.lineTo(x, y + size);
  g.lineTo(x - size, y);
  g.closePath();
}

export function useDrawCharacter(
  role: string,
  fillColor: number,
  borderColor: number,
  size: number = SIZES.agentBody,
) {
  const shape = ROLE_SHAPES[role] || 'circle';
  const roleColor = ROLE_COLORS[role] || 0x6b7280;

  const draw = useCallback(
    (g: any) => {
      g.clear();

      // Body shape
      g.setFillStyle({ color: fillColor });
      g.setStrokeStyle({ width: 2, color: borderColor });

      switch (shape) {
        case 'circle':
          g.circle(0, 0, size);
          break;
        case 'square':
          g.roundRect(-size, -size, size * 2, size * 2, 4);
          break;
        case 'diamond':
          drawDiamond(g, 0, 0, size);
          break;
        case 'hexagon':
          drawHexagon(g, 0, 0, size);
          break;
      }
      g.fill();
      g.stroke();

      // Role badge (small colored dot at top-right)
      g.setFillStyle({ color: roleColor });
      g.circle(size * 0.7, -size * 0.7, 5);
      g.fill();
    },
    [fillColor, borderColor, shape, size, roleColor],
  );

  return draw;
}

export function useDrawSystemEntity(
  type: 'patrol' | 'superintendent' | 'investigator',
  fillColor: number,
  borderColor: number,
) {
  const size =
    type === 'superintendent'
      ? SIZES.superintendentBody
      : type === 'patrol'
        ? SIZES.patrolBody
        : SIZES.investigatorBody;

  const draw = useCallback(
    (g: any) => {
      g.clear();

      g.setFillStyle({ color: fillColor });
      g.setStrokeStyle({ width: 2, color: borderColor });

      if (type === 'patrol') {
        drawHexagon(g, 0, 0, size);
      } else if (type === 'superintendent') {
        g.circle(0, 0, size);
      } else {
        g.circle(0, 0, size);
        // Magnifying glass icon
        g.setStrokeStyle({ width: 1.5, color: borderColor });
        g.circle(3, -3, 5);
        g.stroke();
        g.moveTo(0, 0);
        g.lineTo(-4, 4);
        g.stroke();
      }
      g.fill();
      g.stroke();
    },
    [fillColor, borderColor, type, size],
  );

  return draw;
}
