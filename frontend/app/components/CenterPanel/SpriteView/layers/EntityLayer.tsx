'use client';

import { useMemo, useCallback } from 'react';
import type { AgentStatus, PatrolSelection } from '../../../../types';
import { agents as allAgents } from '../../../../data/mockData';
import { rooms, getDeskPosition, controlRoom, getQuarantineCellPosition, getEntertainmentSeatPosition } from '../config/roomLayout';
import { AgentSprite } from '../entities/AgentSprite';
import { PatrolSprite } from '../entities/PatrolSprite';
import { SuperintendentSprite } from '../entities/SuperintendentSprite';
import { InvestigatorSprite } from '../entities/InvestigatorSprite';
import { NetworkSprite } from '../entities/NetworkSprite';

interface EntityLayerProps {
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  historicalAgentStates?: Record<string, AgentStatus>;
  isLive?: boolean;
  patrolSelection: PatrolSelection | null;
  onPatrolSelect: (selection: PatrolSelection | null) => void;
  pendingAssignment: { patrolId: string; targetAgentId: string } | null;
  onAssignmentComplete: () => void;
}

export function EntityLayer({
  selectedAgentId,
  onSelectAgent,
  getAgentStatus,
  historicalAgentStates,
  isLive,
  patrolSelection,
  onPatrolSelect,
  pendingAssignment,
  onAssignmentComplete,
}: EntityLayerProps) {
  const getEffectiveStatus = useCallback(
    (agentId: string): AgentStatus => {
      if (!isLive && historicalAgentStates?.[agentId]) {
        return historicalAgentStates[agentId];
      }
      return getAgentStatus(agentId);
    },
    [isLive, historicalAgentStates, getAgentStatus],
  );

  // Build agent sprites from room layout, routing suspended agents to quarantine
  const agentSprites = useMemo(() => {
    const sprites: React.JSX.Element[] = [];
    let quarantineSlot = 0;
    let entertainmentSlot = 0;

    for (const room of rooms) {
      for (const desk of room.desks) {
        const agent = allAgents.find((a) => a.id === desk.agentId);
        if (!agent) continue;

        const status = getEffectiveStatus(agent.id);
        let targetX = desk.x;
        let targetY = desk.y;

        if (status === 'suspended') {
          const cellPos = getQuarantineCellPosition(quarantineSlot);
          targetX = cellPos.x;
          targetY = cellPos.y;
          quarantineSlot++;
        } else if (status === 'idle') {
          const seatPos = getEntertainmentSeatPosition(entertainmentSlot);
          targetX = seatPos.x;
          targetY = seatPos.y;
          entertainmentSlot++;
        }

        sprites.push(
          <AgentSprite
            key={agent.id}
            agentId={agent.id}
            name={agent.name}
            role={agent.role}
            status={status}
            riskScore={agent.riskScore}
            record={agent.record}
            x={targetX}
            y={targetY}
            isSelected={selectedAgentId === agent.id}
            onSelect={onSelectAgent}
          />,
        );
      }
    }
    return sprites;
  }, [selectedAgentId, onSelectAgent, getEffectiveStatus]);

  // Determine patrol targets
  const p1Target = pendingAssignment?.patrolId === 'p1' ? pendingAssignment.targetAgentId : null;
  const p2Target = pendingAssignment?.patrolId === 'p2' ? pendingAssignment.targetAgentId : null;
  const p1TargetPos = p1Target ? getDeskPosition(p1Target) : null;
  const p2TargetPos = p2Target ? getDeskPosition(p2Target) : null;
  
  console.log('[EntityLayer] patrol targets:', { pendingAssignment, p1Target, p2Target, p1TargetPos, p2TargetPos });

  return (
    <pixiContainer>
      {/* Agent sprites */}
      {agentSprites}

      {/* Patrol sprites (clickable to select agent for investigation) */}
      <PatrolSprite
        patrolId="p1"
        label="Patrol-1"
        targetAgentId={p1Target}
        targetAgentPos={p1TargetPos}
        onSelect={onPatrolSelect}
        onArrived={onAssignmentComplete}
      />
      <PatrolSprite
        patrolId="p2"
        label="Patrol-2"
        targetAgentId={p2Target}
        targetAgentPos={p2TargetPos}
        onSelect={onPatrolSelect}
        onArrived={onAssignmentComplete}
      />

      {/* Superintendent */}
      <SuperintendentSprite />

      {/* Network */}
      <NetworkSprite x={controlRoom.networkPos.x} y={controlRoom.networkPos.y} />

      {/* Investigators (non-interactive) */}
      <InvestigatorSprite
        investigatorId="f1"
        label="Investigator-1"
      />
      <InvestigatorSprite
        investigatorId="f2"
        label="Investigator-2"
      />
    </pixiContainer>
  );
}
