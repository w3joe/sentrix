'use client';

import { useState, useCallback, useMemo } from 'react';
import type { Agent, AgentStatus, Cluster } from '../types';
import { useAgentsRaw, useInvestigationsRaw } from './api/useBridgeQueries';
import { usePheromones } from './api/usePatrolQueries';
import { adaptAgentsList } from '../lib/adapters';
import { agents as mockAgents, clusters as mockClusters } from '../data/mockData';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

/** Derive suspended agent IDs from concluded investigations with quarantine/suspend sentence. */
function getSuspendedAgentIds(
  investigations: Array<Record<string, unknown>>
): Set<string> {
  const suspended = new Set<string>();
  for (const inv of investigations) {
    let caseFile: Record<string, unknown> | undefined;
    const raw = inv.case_file ?? inv.case_file_json;
    if (typeof raw === 'string') {
      try {
        caseFile = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        caseFile = undefined;
      }
    } else if (raw && typeof raw === 'object') {
      caseFile = raw as Record<string, unknown>;
    }
    const sentence = (caseFile?.sentence ?? inv.sentence) as string | undefined;
    if (sentence === 'quarantine' || sentence === 'suspend') {
      const tid = inv.target_agent_id as string;
      if (tid) suspended.add(tid);
    }
  }
  return suspended;
}

/** Build clusters from agents grouped by cluster_id. */
function buildClusters(agents: Agent[]): Cluster[] {
  const byCluster = new Map<string, Agent[]>();
  for (const a of agents) {
    const cid = (a as Agent & { clusterId?: string }).clusterId ?? 'default';
    if (!byCluster.has(cid)) byCluster.set(cid, []);
    byCluster.get(cid)!.push(a);
  }
  const clusters: Cluster[] = [];
  for (const [cid, ags] of byCluster) {
    const name = cid === 'default' ? 'Unassigned' : `Host ${cid.replace('cluster-', '')}`;
    clusters.push({ id: cid, name, agents: ags });
  }
  return clusters;
}

export function useAgentState() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Map<string, AgentStatus>>(new Map());

  const { data: agentsData, isLoading: agentsLoading, isError: agentsError } = useAgentsRaw();
  const { data: pheromones = {} } = usePheromones();
  const { data: investigationsData } = useInvestigationsRaw();

  const investigations = useMemo(
    () =>
      (investigationsData?.investigations as Array<Record<string, unknown>>) ??
      [],
    [investigationsData]
  );

  const suspendedIds = useMemo(
    () => getSuspendedAgentIds(investigations),
    [investigations]
  );

  const agents = useMemo(() => {
    if (USE_MOCKS) return mockAgents;
    if (!agentsData?.agents || Object.keys(agentsData.agents).length === 0)
      return [];
    const raw = agentsData.agents as Record<string, Record<string, unknown>>;
    return adaptAgentsList(raw, pheromones, suspendedIds);
  }, [agentsData, pheromones, suspendedIds]);

  const clusters = useMemo(() => {
    if (USE_MOCKS) return mockClusters;
    const withCluster = agents as (Agent & { clusterId: string })[];
    return buildClusters(withCluster);
  }, [agents]);

  const getAgentStatus = useCallback(
    (agentId: string): AgentStatus => {
      const override = statusOverrides.get(agentId);
      if (override) return override;
      const agent = agents.find((a) => a.id === agentId);
      return agent?.status ?? 'clean';
    },
    [statusOverrides, agents]
  );

  const selectAgent = useCallback((agentId: string | null) => {
    setSelectedAgentId(agentId);
  }, []);

  const clearAgent = useCallback((agentId: string) => {
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(agentId, 'idle');
      return next;
    });
    fetch(`/api/db/agents/${agentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'idle' }),
    });
  }, []);

  const restrictAgent = useCallback((agentId: string) => {
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(agentId, 'restricted');
      return next;
    });
    fetch(`/api/db/agents/${agentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'restricted' }),
    });
  }, []);

  const suspendAgent = useCallback((agentId: string) => {
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(agentId, 'suspended');
      return next;
    });
    fetch(`/api/db/agents/${agentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended' }),
    });
  }, []);

  const getClustersWithCurrentStatus = useCallback((): Cluster[] => {
    return clusters.map((cluster) => ({
      ...cluster,
      agents: cluster.agents.map((agent) => ({
        ...agent,
        status: getAgentStatus(agent.id),
      })),
    }));
  }, [clusters, getAgentStatus]);

  const getAgentsWithCurrentStatus = useCallback(() => {
    return agents.map((agent) => ({
      ...agent,
      status: getAgentStatus(agent.id),
    }));
  }, [agents, getAgentStatus]);

  return {
    selectedAgentId,
    selectAgent,
    getAgentStatus,
    clearAgent,
    restrictAgent,
    suspendAgent,
    getClustersWithCurrentStatus,
    getAgentsWithCurrentStatus,
    clusters,
    agents,
    isLoading: agentsLoading,
    isError: agentsError,
  };
}
