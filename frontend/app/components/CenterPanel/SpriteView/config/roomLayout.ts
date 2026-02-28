export const WORLD_WIDTH = 1200;
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
    x: 40,
    y: 40,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c1-email', x: 120, y: 120 },
      { agentId: 'c1-coding', x: 280, y: 120 },
      { agentId: 'c1-document', x: 120, y: 230 },
      { agentId: 'c1-data', x: 280, y: 230 },
    ],
  },
  {
    id: 'cluster-2',
    name: 'Host Machine 2',
    x: 720,
    y: 40,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c2-email', x: 800, y: 120 },
      { agentId: 'c2-coding', x: 960, y: 120 },
      { agentId: 'c2-document', x: 800, y: 230 },
      { agentId: 'c2-data', x: 960, y: 230 },
    ],
  },
  {
    id: 'cluster-3',
    name: 'Host Machine 3',
    x: 40,
    y: 580,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c3-email', x: 120, y: 660 },
      { agentId: 'c3-coding', x: 280, y: 660 },
      { agentId: 'c3-document', x: 120, y: 770 },
      { agentId: 'c3-data', x: 280, y: 770 },
    ],
  },
  {
    id: 'cluster-4',
    name: 'Host Machine 4',
    x: 720,
    y: 580,
    width: 440,
    height: 280,
    desks: [
      { agentId: 'c4-email', x: 800, y: 660 },
      { agentId: 'c4-coding', x: 960, y: 660 },
      { agentId: 'c4-document', x: 800, y: 770 },
      { agentId: 'c4-data', x: 960, y: 770 },
    ],
  },
];

export const controlRoom = {
  x: 420,
  y: 370,
  width: 360,
  height: 160,
  superintendentPos: { x: 600, y: 430 },
  investigatorPositions: [
    { id: 'f1', x: 500, y: 470 },
    { id: 'f2', x: 700, y: 470 },
  ],
};

// Patrol route that loops around all 4 host machine rooms in order
export const patrolWaypoints = [
  // Start top-left, patrol around Host Machine 1
  { x: 30, y: 30 },
  { x: 260, y: 30 },
  { x: 480, y: 30 },
  { x: 480, y: 180 },
  { x: 480, y: 320 },
  { x: 260, y: 320 },
  { x: 30, y: 320 },
  { x: 30, y: 180 },
  // Cross over to Host Machine 2 (top-right)
  { x: 480, y: 30 },
  { x: 710, y: 30 },
  { x: 940, y: 30 },
  { x: 1160, y: 30 },
  { x: 1160, y: 180 },
  { x: 1160, y: 320 },
  { x: 940, y: 320 },
  { x: 710, y: 320 },
  // Move down to Host Machine 4 (bottom-right)
  { x: 710, y: 570 },
  { x: 710, y: 720 },
  { x: 710, y: 860 },
  { x: 940, y: 860 },
  { x: 1160, y: 860 },
  { x: 1160, y: 720 },
  { x: 1160, y: 570 },
  { x: 940, y: 570 },
  // Cross over to Host Machine 3 (bottom-left)
  { x: 480, y: 570 },
  { x: 260, y: 570 },
  { x: 30, y: 570 },
  { x: 30, y: 720 },
  { x: 30, y: 860 },
  { x: 260, y: 860 },
  { x: 480, y: 860 },
  { x: 480, y: 720 },
  // Return to start area
  { x: 480, y: 570 },
  { x: 30, y: 570 },
  { x: 30, y: 320 },
];

// Quarantine room - bottom center, between rooms 3 and 4
export const quarantineRoom = {
  x: 350,
  y: 900,
  width: 500,
  height: 120,
  // 2 rows x 8 columns of cell slots (max 16 agents)
  cells: Array.from({ length: 16 }, (_, i) => ({
    slotIndex: i,
    x: 400 + (i % 8) * 55,
    y: 935 + Math.floor(i / 8) * 50,
  })),
};

// Get the quarantine cell position for a given slot index
export function getQuarantineCellPosition(slotIndex: number): { x: number; y: number } {
  const cell = quarantineRoom.cells[slotIndex];
  return cell ? { x: cell.x, y: cell.y } : { x: quarantineRoom.x + 50, y: quarantineRoom.y + 40 };
}

// Get desk position for a given agent ID
export function getDeskPosition(agentId: string): { x: number; y: number } | null {
  for (const room of rooms) {
    const desk = room.desks.find((d) => d.agentId === agentId);
    if (desk) return { x: desk.x, y: desk.y };
  }
  return null;
}
