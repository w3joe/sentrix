import type { AgentStatus, RiskLevel } from '../../../../types';

export const STATUS_COLORS: Record<AgentStatus, { bg: number; border: number; text: string }> = {
  working:    { bg: 0x003a1a, border: 0x00c853, text: '#00c853' },
  idle:       { bg: 0x1e3a5f, border: 0x4a9eff, text: '#4a9eff' },
  restricted: { bg: 0x3a2a00, border: 0xffaa00, text: '#ffaa00' },
  suspended:  { bg: 0x1f2937, border: 0x6b7280, text: '#6b7280' },
};

export const SYSTEM_COLORS = {
  patrol: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
  superintendent: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
  investigator: { bg: 0x1a1a3a, border: 0x9b59b6, text: '#9b59b6' },
  network: { bg: 0x1a1a3a, border: 0x7c3aed, text: '#7c3aed' },
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

// ── Sprite Sheet Configuration ──────────────────────────────────────────────

export const SPRITE_SHEETS = {
  normal_agent: '/sprites/normal_agent.png',
  low_risk_agent: '/sprites/low_risk_agent.png',
  high_risk_agent: '/sprites/high_risk_agent.png',
  restricted: '/sprites/restricted.png',
  investigator: '/sprites/investigator.png',
  patrol: '/sprites/patrol.png',
  superintendent: '/sprites/superintendent.png',
  network: '/sprites/network.png',
} as const;

export const RISK_SPRITE_MAP: Record<RiskLevel, keyof typeof SPRITE_SHEETS> = {
  normal: 'normal_agent',
  low: 'low_risk_agent',
  high: 'high_risk_agent',
};

export const SPRITE_FRAMES = {
  FRONT: 0,
  BACK: 1,
  LEFT: 2,
  RIGHT: 3,
} as const;

export type SpriteDirection = (typeof SPRITE_FRAMES)[keyof typeof SPRITE_FRAMES];

export const SPRITE_DISPLAY_SIZES = {
  agent: 40,
  patrol: 32,
  superintendent: 48,
  investigator: 36,
  network: 36,
};
