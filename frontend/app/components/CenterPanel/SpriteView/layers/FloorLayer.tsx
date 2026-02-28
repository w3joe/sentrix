'use client';

import { useCallback } from 'react';
import {
  rooms,
  controlRoom,
  quarantineRoom,
  entertainmentRoom,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from '../config/roomLayout';
import { WORLD_COLORS, ENVIRONMENT_SPRITES, TILE_SIZE } from '../config/spriteConfig';
import { useEnvironmentTexture } from '../hooks/useEnvironmentTexture';

export function FloorLayer() {
  const { texture: floorTexture, isLoaded: floorLoaded } = useEnvironmentTexture(ENVIRONMENT_SPRITES.floor);
  const { texture: quarantineTexture, isLoaded: quarantineLoaded } = useEnvironmentTexture(
    ENVIRONMENT_SPRITES.quarantine_floor,
  );

  const drawBase = useCallback(
    (g: any) => {
      g.clear();
      // World background
      g.setFillStyle({ color: WORLD_COLORS.background });
      g.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      g.fill();

      // Corridor areas
      g.setFillStyle({ color: WORLD_COLORS.corridor });
      g.rect(0, 320, WORLD_WIDTH, 260);
      g.fill();
      g.rect(680, 0, 240, WORLD_HEIGHT);
      g.fill();

      // Fallback solid fills when textures not loaded
      if (!floorLoaded) {
        for (const room of rooms) {
          g.setFillStyle({ color: WORLD_COLORS.roomFloor });
          g.roundRect(room.x, room.y, room.width, room.height, 8);
          g.fill();
        }
        g.setFillStyle({ color: WORLD_COLORS.controlRoomFloor });
        g.roundRect(controlRoom.x, controlRoom.y, controlRoom.width, controlRoom.height, 8);
        g.fill();
        g.setFillStyle({ color: WORLD_COLORS.entertainmentFloor });
        g.roundRect(entertainmentRoom.x, entertainmentRoom.y, entertainmentRoom.width, entertainmentRoom.height, 8);
        g.fill();
      }
      if (!quarantineLoaded) {
        g.setFillStyle({ color: WORLD_COLORS.quarantineFloor });
        g.roundRect(quarantineRoom.x, quarantineRoom.y, quarantineRoom.width, quarantineRoom.height, 8);
        g.fill();
      }
    },
    [floorLoaded, quarantineLoaded],
  );

  const drawBorders = useCallback((g: any) => {
    g.clear();
    // Room borders and label backgrounds
      for (const room of rooms) {
        g.setStrokeStyle({ width: 2, color: WORLD_COLORS.roomBorder });
        g.roundRect(room.x, room.y, room.width, room.height, 8);
        g.stroke();
        g.setFillStyle({ color: WORLD_COLORS.roomBorder });
        g.roundRect(room.x + 10, room.y + 8, 140, 22, 4);
        g.fill();
      }

      // Control room border and label
      g.setStrokeStyle({ width: 2, color: WORLD_COLORS.controlRoomBorder });
      g.roundRect(controlRoom.x, controlRoom.y, controlRoom.width, controlRoom.height, 8);
      g.stroke();
      g.setFillStyle({ color: WORLD_COLORS.controlRoomBorder });
      g.roundRect(controlRoom.x + 10, controlRoom.y + 8, 120, 22, 4);
      g.fill();

      // Quarantine border and label
      g.setStrokeStyle({ width: 2, color: WORLD_COLORS.quarantineBorder });
      g.roundRect(quarantineRoom.x, quarantineRoom.y, quarantineRoom.width, quarantineRoom.height, 8);
      g.stroke();
      g.setFillStyle({ color: WORLD_COLORS.quarantineBorder });
      g.roundRect(quarantineRoom.x + 10, quarantineRoom.y + 8, 100, 22, 4);
      g.fill();
      g.setStrokeStyle({ width: 3, color: 0xff3355, alpha: 0.3 });
      for (let i = 0; i < 10; i++) {
        const sx = quarantineRoom.x + 20 + i * 48;
        g.moveTo(sx, quarantineRoom.y);
        g.lineTo(sx + 20, quarantineRoom.y);
      }
      g.stroke();

      // Entertainment border and label
      g.setStrokeStyle({ width: 2, color: WORLD_COLORS.entertainmentBorder });
      g.roundRect(entertainmentRoom.x, entertainmentRoom.y, entertainmentRoom.width, entertainmentRoom.height, 8);
      g.stroke();
      g.setFillStyle({ color: WORLD_COLORS.entertainmentBorder });
      g.roundRect(entertainmentRoom.x + 10, entertainmentRoom.y + 8, 140, 22, 4);
      g.fill();
    },
    [],
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBase} />
      {floorTexture &&
        floorLoaded &&
        rooms.map((room) => (
          <pixiTilingSprite
            key={room.id}
            texture={floorTexture}
            x={room.x}
            y={room.y}
            width={room.width}
            height={room.height}
            tileScale={{ x: room.width / TILE_SIZE, y: room.height / TILE_SIZE }}
          />
        ))}
      {floorTexture && floorLoaded && (
        <>
          <pixiTilingSprite
            texture={floorTexture}
            x={controlRoom.x}
            y={controlRoom.y}
            width={controlRoom.width}
            height={controlRoom.height}
            tileScale={{ x: controlRoom.width / TILE_SIZE, y: controlRoom.height / TILE_SIZE }}
          />
          <pixiTilingSprite
            texture={floorTexture}
            x={entertainmentRoom.x}
            y={entertainmentRoom.y}
            width={entertainmentRoom.width}
            height={entertainmentRoom.height}
            tileScale={{ x: entertainmentRoom.width / TILE_SIZE, y: entertainmentRoom.height / TILE_SIZE }}
          />
        </>
      )}
      {quarantineTexture &&
        quarantineLoaded && (
          <pixiTilingSprite
            texture={quarantineTexture}
            x={quarantineRoom.x}
            y={quarantineRoom.y}
            width={quarantineRoom.width}
            height={quarantineRoom.height}
            tileScale={{ x: quarantineRoom.width / TILE_SIZE, y: quarantineRoom.height / TILE_SIZE }}
          />
        )}
      <pixiGraphics draw={drawBorders} />
    </pixiContainer>
  );
}
