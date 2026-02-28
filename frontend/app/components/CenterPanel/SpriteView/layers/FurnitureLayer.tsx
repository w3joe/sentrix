'use client';

import { useCallback } from 'react';
import { rooms, entertainmentRoom, controlRoom } from '../config/roomLayout';
import { WORLD_COLORS, SIZES, ENVIRONMENT_SPRITES } from '../config/spriteConfig';
import { useEnvironmentTexture } from '../hooks/useEnvironmentTexture';

const DESK_TABLE_SCALE = 0.2; // 250px -> 50px
const CHAIR_SCALE = 0.08; // 250px -> 20px
const MONITOR_SCALE = 0.06; // 250px -> 15px
const SEAT_CHAIR_SCALE = 0.12; // 250px -> 30px for entertainment seats

export function FurnitureLayer() {
  const { texture: chairTexture, isLoaded: chairLoaded } = useEnvironmentTexture(ENVIRONMENT_SPRITES.chair);
  const { texture: tableTexture, isLoaded: tableLoaded } = useEnvironmentTexture(ENVIRONMENT_SPRITES.table);
  const { texture: monitorTexture, isLoaded: monitorLoaded } = useEnvironmentTexture(ENVIRONMENT_SPRITES.monitor_rear);

  const drawFallback = useCallback(
    (g: any) => {
      g.clear();
      if (tableLoaded && chairLoaded && monitorLoaded) return;

      for (const room of rooms) {
        for (const desk of room.desks) {
          if (!tableLoaded) {
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
          }
          if (!monitorLoaded) {
            g.setFillStyle({ color: 0x0d1117 });
            g.setStrokeStyle({ width: 1, color: 0x4b5563 });
            g.rect(desk.x - 8, desk.y + 14, 16, 12);
            g.fill();
            g.stroke();
            g.setFillStyle({ color: 0x1a3a5f, alpha: 0.6 });
            g.rect(desk.x - 6, desk.y + 16, 12, 8);
            g.fill();
          }
          if (!chairLoaded) {
            g.setFillStyle({ color: 0x1f2937 });
            g.setStrokeStyle({ width: 1, color: 0x374151 });
            g.circle(desk.x, desk.y - 5, 8);
            g.fill();
            g.stroke();
          }
        }
      }

      if (!tableLoaded) {
        g.setFillStyle({ color: 0x2d1b4e });
        g.setStrokeStyle({ width: 1, color: 0x5b3a8a });
        g.roundRect(760, 405, 80, 30, 3);
        g.fill();
        g.stroke();
      }
      if (!monitorLoaded) {
        for (let i = 0; i < 3; i++) {
          g.setFillStyle({ color: 0x0d1117 });
          g.setStrokeStyle({ width: 1, color: 0x9b59b6 });
          g.rect(768 + i * 22, 409, 16, 12);
          g.fill();
          g.stroke();
        }
      }
      if (!chairLoaded) {
        for (const seat of entertainmentRoom.seats) {
          g.setFillStyle({ color: WORLD_COLORS.entertainmentSeat });
          g.setStrokeStyle({ width: 1, color: WORLD_COLORS.entertainmentSeatBorder });
          g.roundRect(seat.x - 25, seat.y + 10, 50, 20, 6);
          g.fill();
          g.stroke();
        }
      }
    },
    [tableLoaded, chairLoaded, monitorLoaded],
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawFallback} />
      {tableTexture &&
        tableLoaded &&
        rooms.flatMap((room) =>
          room.desks.map((desk) => (
            <pixiSprite
              key={`${room.id}-${desk.agentId}-table`}
              texture={tableTexture}
              x={desk.x}
              y={desk.y + 25}
              anchor={0.5}
              scale={{ x: DESK_TABLE_SCALE, y: SIZES.desk.height / 250 }}
            />
          )),
        )}
      {chairTexture &&
        chairLoaded &&
        rooms.flatMap((room) =>
          room.desks.map((desk) => (
            <pixiSprite
              key={`${room.id}-${desk.agentId}-chair`}
              texture={chairTexture}
              x={desk.x}
              y={desk.y - 5}
              anchor={0.5}
              scale={CHAIR_SCALE}
            />
          )),
        )}
      {monitorTexture &&
        monitorLoaded &&
        rooms.flatMap((room) =>
          room.desks.map((desk) => (
            <pixiSprite
              key={`${room.id}-${desk.agentId}-monitor`}
              texture={monitorTexture}
              x={desk.x}
              y={desk.y + 20}
              anchor={0.5}
              scale={MONITOR_SCALE}
            />
          )),
        )}
      {tableTexture && tableLoaded && (
        <pixiSprite
          texture={tableTexture}
          x={controlRoom.superintendentPos.x}
          y={420}
          anchor={0.5}
          scale={{ x: 0.32, y: 0.12 }}
        />
      )}
      {monitorTexture &&
        monitorLoaded &&
        [0, 1, 2].map((i) => (
          <pixiSprite
            key={`superintendent-monitor-${i}`}
            texture={monitorTexture}
            x={778 + i * 22}
            y={415}
            anchor={0.5}
            scale={MONITOR_SCALE}
          />
        ))}
      {chairTexture &&
        chairLoaded &&
        entertainmentRoom.seats.map((seat, i) => (
          <pixiSprite
            key={`entertainment-seat-${i}`}
            texture={chairTexture}
            x={seat.x}
            y={seat.y + 20}
            anchor={0.5}
            scale={SEAT_CHAIR_SCALE}
          />
        ))}
    </pixiContainer>
  );
}
