'use client';

import { useCallback } from 'react';
import { rooms, controlRoom, quarantineRoom, WORLD_WIDTH, WORLD_HEIGHT } from '../config/roomLayout';
import { WORLD_COLORS } from '../config/spriteConfig';

export function FloorLayer() {
  const drawRooms = useCallback((g: any) => {
    g.clear();

    // World background
    g.setFillStyle({ color: WORLD_COLORS.background });
    g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    g.fill();

    // Corridor areas (slightly different shade)
    g.setFillStyle({ color: WORLD_COLORS.corridor });
    // Horizontal corridors
    g.rect(0, 320, WORLD_WIDTH, 260);
    g.fill();
    // Vertical corridor
    g.rect(480, 0, 240, WORLD_HEIGHT);
    g.fill();

    // Draw rooms
    for (const room of rooms) {
      // Room floor
      g.setFillStyle({ color: WORLD_COLORS.roomFloor });
      g.setStrokeStyle({ width: 2, color: WORLD_COLORS.roomBorder });
      g.roundRect(room.x, room.y, room.width, room.height, 8);
      g.fill();
      g.stroke();

      // Room label background
      g.setFillStyle({ color: WORLD_COLORS.roomBorder });
      g.roundRect(room.x + 10, room.y + 8, 140, 22, 4);
      g.fill();
    }

    // Control room
    g.setFillStyle({ color: WORLD_COLORS.controlRoomFloor });
    g.setStrokeStyle({ width: 2, color: WORLD_COLORS.controlRoomBorder });
    g.roundRect(controlRoom.x, controlRoom.y, controlRoom.width, controlRoom.height, 8);
    g.fill();
    g.stroke();

    // Control room label background
    g.setFillStyle({ color: WORLD_COLORS.controlRoomBorder });
    g.roundRect(controlRoom.x + 10, controlRoom.y + 8, 120, 22, 4);
    g.fill();

    // Quarantine room
    g.setFillStyle({ color: WORLD_COLORS.quarantineFloor });
    g.setStrokeStyle({ width: 2, color: WORLD_COLORS.quarantineBorder });
    g.roundRect(quarantineRoom.x, quarantineRoom.y, quarantineRoom.width, quarantineRoom.height, 8);
    g.fill();
    g.stroke();

    // Quarantine room label background
    g.setFillStyle({ color: WORLD_COLORS.quarantineBorder });
    g.roundRect(quarantineRoom.x + 10, quarantineRoom.y + 8, 100, 22, 4);
    g.fill();

    // Quarantine room warning stripes on border (top edge)
    g.setStrokeStyle({ width: 3, color: 0xff3355, alpha: 0.3 });
    for (let i = 0; i < 10; i++) {
      const sx = quarantineRoom.x + 20 + i * 48;
      g.moveTo(sx, quarantineRoom.y);
      g.lineTo(sx + 20, quarantineRoom.y);
    }
    g.stroke();
  }, []);

  return <pixiGraphics draw={drawRooms} />;
}
