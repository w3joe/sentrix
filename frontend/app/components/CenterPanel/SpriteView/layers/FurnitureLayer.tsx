'use client';

import { useCallback } from 'react';
import { rooms, quarantineRoom } from '../config/roomLayout';
import { WORLD_COLORS, SIZES } from '../config/spriteConfig';

export function FurnitureLayer() {
  const drawFurniture = useCallback((g: any) => {
    g.clear();

    for (const room of rooms) {
      for (const desk of room.desks) {
        // Desk surface
        g.setFillStyle({ color: WORLD_COLORS.desk });
        g.setStrokeStyle({ width: 1, color: WORLD_COLORS.deskBorder });
        g.roundRect(
          desk.x - SIZES.desk.width / 2,
          desk.y + 10,
          SIZES.desk.width,
          SIZES.desk.height,
          3,
        );
        g.fill();
        g.stroke();

        // Monitor on desk (small rectangle)
        g.setFillStyle({ color: 0x0d1117 });
        g.setStrokeStyle({ width: 1, color: 0x4b5563 });
        g.rect(desk.x - 8, desk.y + 14, 16, 12);
        g.fill();
        g.stroke();

        // Monitor screen glow
        g.setFillStyle({ color: 0x1a3a5f, alpha: 0.6 });
        g.rect(desk.x - 6, desk.y + 16, 12, 8);
        g.fill();

        // Chair (small circle behind desk)
        g.setFillStyle({ color: 0x1f2937 });
        g.setStrokeStyle({ width: 1, color: 0x374151 });
        g.circle(desk.x, desk.y - 5, 8);
        g.fill();
        g.stroke();
      }
    }

    // Superintendent desk in control room
    g.setFillStyle({ color: 0x2d1b4e });
    g.setStrokeStyle({ width: 1, color: 0x5b3a8a });
    g.roundRect(560, 405, 80, 30, 3);
    g.fill();
    g.stroke();

    // Multiple monitor screens on superintendent desk
    for (let i = 0; i < 3; i++) {
      g.setFillStyle({ color: 0x0d1117 });
      g.setStrokeStyle({ width: 1, color: 0x9b59b6 });
      g.rect(568 + i * 22, 409, 16, 12);
      g.fill();
      g.stroke();
    }

    // Quarantine cells
    for (const cell of quarantineRoom.cells) {
      // Cell background
      g.setFillStyle({ color: WORLD_COLORS.quarantineCell });
      g.setStrokeStyle({ width: 1, color: WORLD_COLORS.quarantineCellBorder });
      g.roundRect(cell.x - 20, cell.y - 18, 40, 36, 2);
      g.fill();
      g.stroke();

      // Bars overlay (vertical lines)
      g.setStrokeStyle({ width: 1, color: WORLD_COLORS.quarantineBars, alpha: 0.4 });
      for (let b = -12; b <= 12; b += 8) {
        g.moveTo(cell.x + b, cell.y - 18);
        g.lineTo(cell.x + b, cell.y + 18);
      }
      g.stroke();
    }
  }, []);

  return <pixiGraphics draw={drawFurniture} />;
}
