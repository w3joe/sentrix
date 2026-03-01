'use client';

import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import * as bridgeApi from '../../lib/api/bridgeApi';
import {
  adaptAgent,
  adaptAgentsList,
  adaptA2AMessage,
  adaptActionLog,
  adaptCaseFile,
} from '../../lib/adapters';
import type { Agent, A2AMessage, AgentActionLog, CaseFile } from '../../types';

const BRIDGE_KEYS = {
  health: ['bridge-health'] as const,
  agents: ['agents'] as const,
  agent: (id: string) => ['agent', id] as const,
  agentComms: (id: string) => ['agent-comms', id] as const,
  agentActions: (id: string) => ['agent-actions', id] as const,
  agentNetwork: (id: string) => ['agent-network', id] as const,
  messages: ['messages'] as const,
  investigations: ['investigations'] as const,
  investigation: (id: string) => ['investigation', id] as const,
};

export function useBridgeHealth() {
  return useQuery({
    queryKey: BRIDGE_KEYS.health,
    queryFn: bridgeApi.getHealth,
    refetchInterval: 60_000,
  });
}

/** Raw agents from Bridge DB - use with useAgentsWithStatus for pheromone-derived status. */
export function useAgentsRaw() {
  return useQuery({
    queryKey: BRIDGE_KEYS.agents,
    queryFn: bridgeApi.getAgents,
    refetchInterval: 30_000,
  });
}

/** Basic agents with risk from Bridge DB only (no pheromone status). */
export function useAgents() {
  return useQuery({
    queryKey: BRIDGE_KEYS.agents,
    queryFn: bridgeApi.getAgents,
    refetchInterval: 30_000,
    select: (data) =>
      adaptAgentsList(data.agents as Record<string, Record<string, unknown>>),
  });
}

export function useAgent(agentId: string | null, enabled = true) {
  return useQuery({
    queryKey: BRIDGE_KEYS.agent(agentId ?? ''),
    queryFn: () => bridgeApi.getAgent(agentId!),
    enabled: !!agentId && enabled,
    select: (data) => adaptAgent(data as Record<string, unknown>),
  });
}

export function useAgentCommunications(agentId: string | null, limit = 20) {
  return useQuery({
    queryKey: [...BRIDGE_KEYS.agentComms(agentId ?? ''), limit],
    queryFn: () => bridgeApi.getAgentCommunications(agentId!, limit),
    enabled: !!agentId,
    select: (data) =>
      (data.messages as Record<string, unknown>[]).map((m) =>
        adaptA2AMessage(m)
      ) as A2AMessage[],
  });
}

export function useAgentActions(agentId: string | null, limit = 50) {
  return useQuery({
    queryKey: [...BRIDGE_KEYS.agentActions(agentId ?? ''), limit],
    queryFn: () => bridgeApi.getAgentActions(agentId!, limit),
    enabled: !!agentId,
    select: (data) =>
      (data.actions as Record<string, unknown>[]).map((m) =>
        adaptActionLog(m)
      ) as AgentActionLog[],
  });
}

export function useAgentNetwork(agentId: string | null) {
  return useQuery({
    queryKey: BRIDGE_KEYS.agentNetwork(agentId ?? ''),
    queryFn: () => bridgeApi.getAgentNetwork(agentId!),
    enabled: !!agentId,
  });
}

/** Violation counts per agent (from action logs). Use for ViolationChart. */
export function useAgentViolationCounts(agentIds: string[]) {
  const limit = 100;
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: [...BRIDGE_KEYS.agentActions(id), limit],
      queryFn: () => bridgeApi.getAgentActions(id, limit),
      select: (data: { actions: Record<string, unknown>[] }) => {
        const logs = (data.actions ?? []).map((a) => adaptActionLog(a));
        return logs.filter((l) => l.violation).length;
      },
    })),
  });
  const counts: Record<string, number> = {};
  results.forEach((r, i) => {
    if (r.data !== undefined && agentIds[i]) counts[agentIds[i]] = r.data;
  });
  return {
    data: counts,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/** All violation action logs across agents (for timeline synthesis). */
export function useAllViolationLogs(agentIds: string[]) {
  const limit = 50;
  const results = useQueries({
    queries: agentIds.map((id) => ({
      queryKey: [...BRIDGE_KEYS.agentActions(id), limit],
      queryFn: () => bridgeApi.getAgentActions(id, limit),
      select: (data: { actions: Record<string, unknown>[] }) =>
        (data.actions ?? [])
          .map((a) => adaptActionLog(a))
          .filter((l) => l.violation),
    })),
  });
  const logs: AgentActionLog[] = [];
  results.forEach((r) => {
    if (r.data) logs.push(...r.data);
  });
  return { data: logs, isLoading: results.some((r) => r.isLoading), isError: results.some((r) => r.isError) };
}

export function useMessages() {
  return useQuery({
    queryKey: BRIDGE_KEYS.messages,
    queryFn: bridgeApi.getMessages,
    refetchInterval: 15_000,
    select: (data) =>
      (data.messages as Record<string, unknown>[]).map((m) =>
        adaptA2AMessage(m)
      ),
  });
}

export function useInvestigationsRaw() {
  return useQuery({
    queryKey: BRIDGE_KEYS.investigations,
    queryFn: bridgeApi.getInvestigations,
    refetchInterval: 10_000,
  });
}

export function useInvestigations() {
  return useQuery({
    queryKey: BRIDGE_KEYS.investigations,
    queryFn: bridgeApi.getInvestigations,
    refetchInterval: 10_000,
    select: (data) =>
      (data.investigations as Record<string, unknown>[]).map((r) => {
        const inv = r as Record<string, unknown>;
        return {
          investigationId: inv.investigation_id,
          flagId: inv.flag_id,
          targetAgentId: inv.target_agent_id,
          status: inv.status,
          openedAt: inv.opened_at,
          concludedAt: inv.concluded_at,
          verdict: inv.verdict,
          severityScore: inv.severity_score,
        };
      }),
  });
}

/** Case files for InvestigationRegistry — parses case_file_json into CaseFile shape. */
export function useCaseFiles() {
  return useQuery({
    queryKey: [...BRIDGE_KEYS.investigations, 'caseFiles'],
    queryFn: bridgeApi.getInvestigations,
    refetchInterval: 5_000,
    select: (data) => {
      const rows = data.investigations as Record<string, unknown>[];
      return rows
        .map((inv) => {
          let cf = inv.case_file as Record<string, unknown> | undefined;
          const raw = inv.case_file_json ?? inv.case_file;
          if (typeof raw === 'string') {
            try {
              cf = JSON.parse(raw) as Record<string, unknown>;
            } catch {
              cf = undefined;
            }
          } else if (raw && typeof raw === 'object') {
            cf = raw as Record<string, unknown>;
          }
          if (!cf) {
            // No case_file_json yet (investigation still open/in_progress)
            return {
              investigationId: (inv.investigation_id as string) ?? '',
              flagId: (inv.flag_id as string) ?? '',
              targetAgentId: (inv.target_agent_id as string) ?? '',
              crimeClassification: 'unknown',
              verdict: (inv.verdict as string) ?? 'under_watch',
              severityScore: (inv.severity_score as number) ?? 0,
              confidence: 0,
              summary: '',
              keyFindings: [],
              evidenceSummary: '',
              investigatorReport: { crimeClassification: 'unknown', relevantLogIds: [], caseFacts: '' },
              networkAnalysis: { flaggedRelevantMessages: [] },
              damageReport: { damageSeverity: 'none', causalChain: [], affectedAgents: [], dataExposureScope: '', propagationRisk: '', estimatedImpact: '' },
              concludedAt: (inv.concluded_at as string) ?? null,
              status: ((inv.status as string) || 'open') as 'open' | 'in_progress' | 'concluded',
            };
          }
          // adaptCaseFile(cf) uses cf.status which is absent in case_file JSON — status lives on DB row
          const adapted = adaptCaseFile({ ...cf, status: inv.status });
          return adapted as import('../../types').CaseFile;
        })
        .filter(Boolean) as import('../../types').CaseFile[];
    },
  });
}

export function useInvestigation(investigationId: string | null) {
  return useQuery({
    queryKey: BRIDGE_KEYS.investigation(investigationId ?? ''),
    queryFn: () => bridgeApi.getInvestigation(investigationId!),
    enabled: !!investigationId,
    refetchInterval: (query) => {
      const status = (query.state.data as Record<string, unknown>)?.status;
      if (status === 'concluded') return false;
      if (status === 'in_progress' || status === 'open') return 5_000;
      return 10_000;
    },
    select: (data) => {
      const d = data as Record<string, unknown>;
      const cf = d.case_file as Record<string, unknown> | null;
      return {
        investigationId: d.investigation_id,
        status: d.status,
        verdict: d.verdict,
        error: d.error,
        caseFile: cf ? adaptCaseFile(cf) : null,
      };
    },
  });
}

export function useRebuildGraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bridgeApi.rebuildGraph,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BRIDGE_KEYS.agents });
      qc.invalidateQueries({ queryKey: BRIDGE_KEYS.investigations });
    },
  });
}
