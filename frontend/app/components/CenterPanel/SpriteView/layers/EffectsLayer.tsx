'use client';

import { useCallback, useMemo } from 'react';
import { rooms, controlRoom, quarantineRoom } from '../config/roomLayout';

// Room labels drawn as text overlay
export function EffectsLayer() {
  const roomLabels = useMemo(
    () =>
      rooms.map((room) => (
        <pixiText
          key={room.id}
          text={room.name}
          x={room.x + 15}
          y={room.y + 13}
          style={{
            fontSize: 11,
            fill: '#9ca3af',
            fontFamily: 'monospace',
            fontWeight: 'bold',
          }}
        />
      )),
    [],
  );

  return (
    <pixiContainer>
      {roomLabels}
      <pixiText
        text="Control Room"
        x={controlRoom.x + 15}
        y={controlRoom.y + 13}
        style={{
          fontSize: 11,
          fill: '#9b59b6',
          fontFamily: 'monospace',
          fontWeight: 'bold',
        }}
      />
      <pixiText
        text="Quarantine"
        x={quarantineRoom.x + 15}
        y={quarantineRoom.y + 13}
        style={{
          fontSize: 11,
          fill: '#ff3355',
          fontFamily: 'monospace',
          fontWeight: 'bold',
        }}
      />
    </pixiContainer>
  );
}
