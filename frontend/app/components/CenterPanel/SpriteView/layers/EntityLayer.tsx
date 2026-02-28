'use client';

import { useMemo, useCallback } from 'react';
import type { AgentStatus, InvestigatorSelection } from '../../../../types';
import { agents as allAgents, agentActivityStatuses } from '../../../../data/mockData';
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
  investigatorSelection: InvestigatorSelection | null;
  onInvestigatorSelect: (selection: InvestigatorSelection | null) => void;
  pendingAssignment: { investigatorId: string; targetAgentId: string } | null;
  onAssignmentComplete: () => void;
}

export function EntityLayer({
  selectedAgentId,
  onSelectAgent,
  getAgentStatus,
  historicalAgentStates,
  isLive,
  investigatorSelection,
  onInvestigatorSelect,
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
        const activityStatus = agentActivityStatuses[agent.id] || 'idle';
        let targetX = desk.x;
        let targetY = desk.y;

        // If suspended, assign to quarantine cell
        if (status === 'suspended') {
          const cellPos = getQuarantineCellPosition(quarantineSlot);
          targetX = cellPos.x;
          targetY = cellPos.y;
          quarantineSlot++;
        } else if (activityStatus === 'idle') {
          // If idle, send to entertainment room
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
            activityStatus={agentActivityStatuses[agent.id] || 'idle'}
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

  // Determine investigator targets
  const f1Target = pendingAssignment?.investigatorId === 'f1' ? pendingAssignment.targetAgentId : null;
  const f2Target = pendingAssignment?.investigatorId === 'f2' ? pendingAssignment.targetAgentId : null;
  const f1TargetPos = f1Target ? getDeskPosition(f1Target) : null;
  const f2TargetPos = f2Target ? getDeskPosition(f2Target) : null;

  return (
    <pixiContainer>
      {/* Agent sprites */}
      {agentSprites}

      {/* Patrol sprites */}
      <PatrolSprite patrolId="p1" label="Patrol-1" />
      <PatrolSprite patrolId="p2" label="Patrol-2" />

      {/* Superintendent */}
      <SuperintendentSprite />

      {/* Network */}
      <NetworkSprite x={controlRoom.networkPos.x} y={controlRoom.networkPos.y} />

      {/* Investigators */}
      <InvestigatorSprite
        investigatorId="f1"
        label="Investigator-1"
        targetAgentId={f1Target}
        targetAgentPos={f1TargetPos}
        onSelect={onInvestigatorSelect}
        onArrived={onAssignmentComplete}
      />
      <InvestigatorSprite
        investigatorId="f2"
        label="Investigator-2"
        targetAgentId={f2Target}
        targetAgentPos={f2TargetPos}
        onSelect={onInvestigatorSelect}
        onArrived={onAssignmentComplete}
      />
    </pixiContainer>
  );
}
