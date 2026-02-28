import { API_URLS } from './config';
import { apiFetch } from './fetcher';

const base = API_URLS.investigation;

export async function getHealth() {
  return apiFetch<{
    status: string;
    service: string;
    port: number;
  }>(`${base}/api/investigation/health`);
}

export async function listInvestigations() {
  return apiFetch<{
    investigations: Record<string, unknown>[];
    count: number;
  }>(`${base}/api/investigation`);
}

export interface InvestigateRequest {
  flag_id: string;
  target_agent_id: string;
  consensus_severity: string;
  consensus_confidence: number;
  votes?: Record<string, unknown>[];
  pii_labels_union?: string[];
  referral_summary?: string;
  pheromone_level?: number;
}

export async function startInvestigation(payload: InvestigateRequest) {
  return apiFetch<{
    investigation_id: string;
    status: string;
    message: string;
  }>(`${base}/api/investigation/investigate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function getInvestigation(investigationId: string) {
  return apiFetch<{
    investigation_id: string;
    status: string;
    error: string | null;
    case_file: Record<string, unknown> | null;
    verdict?: string;
    sentence?: string;
  }>(
    `${base}/api/investigation/${encodeURIComponent(investigationId)}`
  );
}
