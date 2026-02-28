'use client';

import type { Texture } from 'pixi.js';
import { rooms, controlRoom, quarantineRoom, entertainmentRoom } from '../config/roomLayout';
import { ENVIRONMENT_SPRITES, TILE_SIZE } from '../config/spriteConfig';
import { useEnvironmentTexture } from '../hooks/useEnvironmentTexture';

const WALL_SCALE = 0.2; // Scale wall sprites to 50px (250 * 0.2)

function RoomWalls({
  x,
  y,
  width,
  height,
  wallTextures,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  wallTextures: Record<string, Texture | null>;
}) {
  const t = wallTextures;
  const hasAll =
    t.wall_top &&
    t.wall_top_left &&
    t.wall_top_right &&
    t.wall_bottom &&
    t.wall_bottom_left &&
    t.wall_bottom_right &&
    t.wall_left &&
    t.wall_right;

  if (!hasAll) return null;

  const topHeight = TILE_SIZE * WALL_SCALE;
  const sideWidth = TILE_SIZE * WALL_SCALE;

  return (
    <pixiContainer x={x} y={y}>
      {/* Corners */}
      <pixiSprite texture={t.wall_top_left!} x={0} y={0} anchor={0} scale={WALL_SCALE} />
      <pixiSprite texture={t.wall_top_right!} x={width - sideWidth} y={0} anchor={0} scale={WALL_SCALE} />
      <pixiSprite texture={t.wall_bottom_left!} x={0} y={height - topHeight} anchor={0} scale={WALL_SCALE} />
      <pixiSprite texture={t.wall_bottom_right!} x={width - sideWidth} y={height - topHeight} anchor={0} scale={WALL_SCALE} />
      {/* Edges - tile the middle sections */}
      {width > sideWidth * 2 && t.wall_top && (
        <pixiTilingSprite
          texture={t.wall_top}
          x={sideWidth}
          y={0}
          width={width - sideWidth * 2}
          height={topHeight}
          tileScale={{ x: (width - sideWidth * 2) / TILE_SIZE, y: 1 }}
        />
      )}
      {width > sideWidth * 2 && t.wall_bottom && (
        <pixiTilingSprite
          texture={t.wall_bottom}
          x={sideWidth}
          y={height - topHeight}
          width={width - sideWidth * 2}
          height={topHeight}
          tileScale={{ x: (width - sideWidth * 2) / TILE_SIZE, y: 1 }}
        />
      )}
      {height > topHeight * 2 && t.wall_left && (
        <pixiTilingSprite
          texture={t.wall_left}
          x={0}
          y={topHeight}
          width={sideWidth}
          height={height - topHeight * 2}
          tileScale={{ x: 1, y: (height - topHeight * 2) / TILE_SIZE }}
        />
      )}
      {height > topHeight * 2 && t.wall_right && (
        <pixiTilingSprite
          texture={t.wall_right}
          x={width - sideWidth}
          y={topHeight}
          width={sideWidth}
          height={height - topHeight * 2}
          tileScale={{ x: 1, y: (height - topHeight * 2) / TILE_SIZE }}
        />
      )}
    </pixiContainer>
  );
}

export function WallsLayer() {
  const wall_top = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_top);
  const wall_top_left = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_top_left);
  const wall_top_right = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_top_right);
  const wall_bottom = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_bottom);
  const wall_bottom_left = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_bottom_left);
  const wall_bottom_right = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_bottom_right);
  const wall_left = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_left);
  const wall_right = useEnvironmentTexture(ENVIRONMENT_SPRITES.wall_right);

  const wallTextures = {
    wall_top: wall_top.texture,
    wall_top_left: wall_top_left.texture,
    wall_top_right: wall_top_right.texture,
    wall_bottom: wall_bottom.texture,
    wall_bottom_left: wall_bottom_left.texture,
    wall_bottom_right: wall_bottom_right.texture,
    wall_left: wall_left.texture,
    wall_right: wall_right.texture,
  };

  return (
    <pixiContainer>
      {rooms.map((room) => (
        <RoomWalls
          key={room.id}
          x={room.x}
          y={room.y}
          width={room.width}
          height={room.height}
          wallTextures={wallTextures}
        />
      ))}
      <RoomWalls
        x={controlRoom.x}
        y={controlRoom.y}
        width={controlRoom.width}
        height={controlRoom.height}
        wallTextures={wallTextures}
      />
      <RoomWalls
        x={quarantineRoom.x}
        y={quarantineRoom.y}
        width={quarantineRoom.width}
        height={quarantineRoom.height}
        wallTextures={wallTextures}
      />
      <RoomWalls
        x={entertainmentRoom.x}
        y={entertainmentRoom.y}
        width={entertainmentRoom.width}
        height={entertainmentRoom.height}
        wallTextures={wallTextures}
      />
    </pixiContainer>
  );
}
