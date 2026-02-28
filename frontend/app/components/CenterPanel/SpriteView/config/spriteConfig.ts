import type { AgentStatus } from '../../../../types';

export const STATUS_COLORS: Record<AgentStatus, { bg: number; border: number; text: string }> = {
  critical: { bg: 0x3a0010, border: 0xff3355, text: '#ff3355' },
  warning: { bg: 0x3a2a00, border: 0xffaa00, text: '#ffaa00' },
  clean: { bg: 0x1e3a5f, border: 0x00d4ff, text: '#00d4ff' },
  suspended: { bg: 0x1f2937, border: 0x6b7280, text: '#6b7280' },
};

export const SYSTEM_COLORS = {
  patrol: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
  superintendent: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
  investigator: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
};

export const WORLD_COLORS = {
  background: 0x0a0e1a,
  roomFloor: 0x111827,
  roomBorder: 0x1f2937,
  controlRoomFloor: 0x0f1520,
  controlRoomBorder: 0x2d1b4e,
  desk: 0x1f2937,
  deskBorder: 0x374151,
  corridor: 0x0d1117,
  quarantineFloor: 0x1a0a0a,
  quarantineBorder: 0x661122,
  quarantineCell: 0x2a0f0f,
  quarantineCellBorder: 0x4a1a1a,
  quarantineBars: 0x882233,
};

export const ROLE_COLORS: Record<string, number> = {
  EMAIL_AGENT: 0x3b82f6,
  CODING_AGENT: 0x22c55e,
  DOCUMENT_AGENT: 0xf59e0b,
  DATA_QUERY_AGENT: 0xa855f7,
};

export const SIZES = {
  agentBody: 20,
  patrolBody: 16,
  superintendentBody: 24,
  investigatorBody: 18,
  desk: { width: 50, height: 30 },
  selectionRingRadius: 28,
  auraRadius: 32,
};

export const MOVEMENT = {
  investigatorSpeed: 0.06,
  agentTransitionSpeed: 0.04,
};
