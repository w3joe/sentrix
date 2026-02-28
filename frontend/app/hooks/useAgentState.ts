'use client';

import { useState, useCallback } from 'react';
import type { AgentStatus } from '../types';
import { agents as initialAgents, clusters as initialClusters } from '../data/mockData';

interface AgentState {
  id: string;
  status: AgentStatus;
}

export function useAgentState() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>('n1'); // Default to email-drafter-01
  const [agentStates, setAgentStates] = useState<Map<string, AgentStatus>>(() => {
    const map = new Map<string, AgentStatus>();
    initialAgents.forEach(agent => {
      map.set(agent.id, agent.status);
    });
    return map;
  });

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const getAgentStatus = useCallback((agentId: string): AgentStatus => {
    return agentStates.get(agentId) ?? 'clean';
  }, [agentStates]);

  const clearAgent = useCallback((agentId: string) => {
    setAgentStates(prev => {
      const newMap = new Map(prev);
      newMap.set(agentId, 'clean');
      return newMap;
    });
  }, []);

  const restrictAgent = useCallback((agentId: string) => {
    setAgentStates(prev => {
      const newMap = new Map(prev);
      newMap.set(agentId, 'warning');
      return newMap;
    });
  }, []);

  const suspendAgent = useCallback((agentId: string) => {
    setAgentStates(prev => {
      const newMap = new Map(prev);
      newMap.set(agentId, 'suspended');
      return newMap;
    });
  }, []);

  const getAgentsWithCurrentStatus = useCallback(() => {
    return initialAgents.map(agent => ({
      ...agent,
      status: agentStates.get(agent.id) ?? agent.status,
    }));
  }, [agentStates]);

  const getClustersWithCurrentStatus = useCallback(() => {
    return initialClusters.map(cluster => ({
      ...cluster,
      agents: cluster.agents.map(agent => ({
        ...agent,
        status: agentStates.get(agent.id) ?? agent.status,
      })),
    }));
  }, [agentStates]);

  return {
    selectedAgentId,
    selectAgent,
    getAgentStatus,
    clearAgent,
    restrictAgent,
    suspendAgent,
    getAgentsWithCurrentStatus,
    getClustersWithCurrentStatus,
    agentStates,
  };
}
