import { API_URLS } from './config';
import { apiFetch } from './fetcher';

const base = API_URLS.patrol;

export async function getSwarmStatus() {
  return apiFetch<{
    data_source: string;
    patrol_pool: string[];
    current_cycle: number;
    current_assignments: Record<string, string[]>;
    monitored_agents: Record<string, unknown>;
    scheduler_running: boolean;
  }>(`${base}/api/swarm/status`);
}

export async function getFlags() {
  return apiFetch<Record<string, unknown>[]>(`${base}/api/swarm/flags`);
}

export async function getPheromones() {
  return apiFetch<Record<string, number>>(`${base}/api/swarm/pheromones`);
}

export async function getSweeps() {
  return apiFetch<Record<string, unknown>[]>(`${base}/api/swarm/sweeps`);
}

export async function triggerSweep() {
  return apiFetch<{
    triggered: boolean;
    message: string;
    current_cycle: number;
  }>(`${base}/api/swarm/sweep`, { method: 'POST' });
}
