'use client';

import dynamic from 'next/dynamic';
import type { AgentStatus, PatrolSelection, Agent } from '../../../types';

const SpriteWorld = dynamic(() => import('./SpriteWorld'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#0a0e1a] flex items-center justify-center">
      <div className="text-gray-500 font-mono text-sm">Loading Sprite View...</div>
    </div>
  ),
});

export interface SpriteViewProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  historicalAgentStates?: Record<string, AgentStatus>;
  isLive?: boolean;
  patrolSelection: PatrolSelection | null;
  onPatrolSelect: (selection: PatrolSelection | null) => void;
  pendingAssignment: { patrolId: string; targetAgentId: string } | null;
  onAssignmentComplete: () => void;
  agents: Agent[];
}

export function SpriteView(props: SpriteViewProps) {
  return <SpriteWorld {...props} />;
}
