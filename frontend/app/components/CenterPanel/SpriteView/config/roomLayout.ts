export const WORLD_WIDTH = 1400;
export const WORLD_HEIGHT = 1050;

export interface DeskPosition {
  agentId: string;
  x: number;
  y: number;
}

export interface RoomConfig {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  desks: DeskPosition[];
}

export const rooms: RoomConfig[] = [
  {
    id: 'cluster-1',
    name: 'Host Machine 1',
    x: 240,
    y: 40,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c1-email', x: 320, y: 120 },
      { agentId: 'c1-coding', x: 480, y: 120 },
      { agentId: 'c1-document', x: 320, y: 230 },
      { agentId: 'c1-data', x: 480, y: 230 },
    ],
  },
  {
    id: 'cluster-2',
    name: 'Host Machine 2',
    x: 920,
    y: 40,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c2-email', x: 1000, y: 120 },
      { agentId: 'c2-coding', x: 1160, y: 120 },
      { agentId: 'c2-document', x: 1000, y: 230 },
      { agentId: 'c2-data', x: 1160, y: 230 },
    ],
  },
  {
    id: 'cluster-3',
    name: 'Host Machine 3',
    x: 240,
    y: 580,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c3-email', x: 320, y: 660 },
      { agentId: 'c3-coding', x: 480, y: 660 },
      { agentId: 'c3-document', x: 320, y: 770 },
      { agentId: 'c3-data', x: 480, y: 770 },
    ],
  },
  {
    id: 'cluster-4',
    name: 'Host Machine 4',
    x: 920,
    y: 580,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c4-email', x: 1000, y: 660 },
      { agentId: 'c4-coding', x: 1160, y: 660 },
      { agentId: 'c4-document', x: 1000, y: 770 },
      { agentId: 'c4-data', x: 1160, y: 770 },
    ],
  },
];

export const controlRoom = {
  x: 620,
  y: 370,
  width: 360,
  height: 160,
  superintendentPos: { x: 800, y: 430 },
  networkPos: { x: 700, y: 420 },
  investigatorPositions: [
    { id: 'f1', x: 700, y: 470 },
    { id: 'f2', x: 900, y: 470 },
  ],
};

// Patrol route that loops around all 4 host machine rooms in order
export const patrolWaypoints = [
  // Start top-left, patrol around Host Machine 1
  { x: 230, y: 30 },
  { x: 460, y: 30 },
  { x: 680, y: 30 },
  { x: 680, y: 180 },
  { x: 680, y: 320 },
  { x: 460, y: 320 },
  { x: 230, y: 320 },
  { x: 230, y: 180 },
  // Cross over to Host Machine 2 (top-right)
  { x: 680, y: 30 },
  { x: 910, y: 30 },
  { x: 1140, y: 30 },
  { x: 1360, y: 30 },
  { x: 1360, y: 180 },
  { x: 1360, y: 320 },
  { x: 1140, y: 320 },
  { x: 910, y: 320 },
  // Move down to Host Machine 4 (bottom-right)
  { x: 910, y: 570 },
  { x: 910, y: 720 },
  { x: 910, y: 860 },
  { x: 1140, y: 860 },
  { x: 1360, y: 860 },
  { x: 1360, y: 720 },
  { x: 1360, y: 570 },
  { x: 1140, y: 570 },
  // Cross over to Host Machine 3 (bottom-left)
  { x: 680, y: 570 },
  { x: 460, y: 570 },
  { x: 230, y: 570 },
  { x: 230, y: 720 },
  { x: 230, y: 860 },
  { x: 460, y: 860 },
  { x: 680, y: 860 },
  { x: 680, y: 720 },
  // Return to start area
  { x: 680, y: 570 },
  { x: 230, y: 570 },
  { x: 230, y: 320 },
];

// Quarantine room - bottom center, between rooms 3 and 4
export const quarantineRoom = {
  x: 550,
  y: 900,
  width: 500,
  height: 120,
  // 2 rows x 8 columns of cell slots (max 16 agents)
  cells: Array.from({ length: 16 }, (_, i) => ({
    slotIndex: i,
    x: 600 + (i % 8) * 55,
    y: 935 + Math.floor(i / 8) * 50,
  })),
};

// Get the quarantine cell position for a given slot index
export function getQuarantineCellPosition(slotIndex: number): { x: number; y: number } {
  const cell = quarantineRoom.cells[slotIndex];
  return cell ? { x: cell.x, y: cell.y } : { x: quarantineRoom.x + 50, y: quarantineRoom.y + 40 };
}

// Entertainment room - left side, spanning Host Machine 1 to Host Machine 3
export const entertainmentRoom = {
  x: 40,
  y: 40,
  width: 160,
  height: 820,
  // Seating positions for idle agents (up to 8 seats, vertically spaced)
  seats: Array.from({ length: 8 }, (_, i) => ({
    slotIndex: i,
    x: 120,
    y: 120 + i * 95,
  })),
};

// Get the entertainment seat position for a given slot index
export function getEntertainmentSeatPosition(slotIndex: number): { x: number; y: number } {
  const seat = entertainmentRoom.seats[slotIndex];
  return seat ? { x: seat.x, y: seat.y } : { x: entertainmentRoom.x + 80, y: entertainmentRoom.y + 40 };
}

// Get desk position for a given agent ID
export function getDeskPosition(agentId: string): { x: number; y: number } | null {
  for (const room of rooms) {
    const desk = room.desks.find((d) => d.agentId === agentId);
    if (desk) return { x: desk.x, y: desk.y };
  }
  return null;
}
