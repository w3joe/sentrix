import { API_URLS } from './config';
import { apiFetch } from './fetcher';

const base = API_URLS.bridge;

export async function getHealth() {
  return apiFetch<{
    status: string;
    clusters_in_registry: number;
    agents_in_registry: number;
    graph_nodes: number;
    graph_edges: number;
  }>(`${base}/api/db/health`);
}

/** Bridge DB returns agents as Record<agent_id, profile> */
export async function getAgents() {
  return apiFetch<{
    agents: Record<string, Record<string, unknown>>;
    count: number;
  }>(`${base}/api/db/agents`);
}

export async function getAgent(agentId: string) {
  return apiFetch<Record<string, unknown>>(
    `${base}/api/db/agents/${encodeURIComponent(agentId)}`
  );
}

export async function getAgentCommunications(agentId: string, limit = 20) {
  return apiFetch<{
    agent_id: string;
    messages: Record<string, unknown>[];
    count: number;
  }>(
    `${base}/api/db/agents/${encodeURIComponent(agentId)}/communications?limit=${limit}`
  );
}

export async function getAgentActions(agentId: string, limit = 50) {
  return apiFetch<{
    agent_id: string;
    actions: Record<string, unknown>[];
    count: number;
  }>(
    `${base}/api/db/agents/${encodeURIComponent(agentId)}/actions?limit=${limit}`
  );
}

export async function getAgentNetwork(agentId: string, limit = 10) {
  return apiFetch<{
    agent_id: string;
    narration: string;
    interaction_partners: string[];
    recent_communications: Array<{
      from: string;
      to: string;
      timestamp: string;
      body_preview: string;
    }>;
  }>(
    `${base}/api/db/agents/${encodeURIComponent(agentId)}/network?limit=${limit}`
  );
}

export async function getMessages() {
  return apiFetch<{ messages: Record<string, unknown>[]; count: number }>(
    `${base}/api/db/messages`
  );
}

export async function getInvestigations() {
  return apiFetch<{
    investigations: Record<string, unknown>[];
    count: number;
  }>(`${base}/api/db/investigations`);
}

export async function getInvestigation(investigationId: string) {
  return apiFetch<Record<string, unknown>>(
    `${base}/api/db/investigations/${encodeURIComponent(investigationId)}`
  );
}

export async function rebuildGraph() {
  return apiFetch<{ rebuilt: boolean; nodes: number; edges: number }>(
    `${base}/api/db/graph/rebuild`,
    { method: 'POST' }
  );
}
