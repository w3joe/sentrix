'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as patrolApi from '../../lib/api/patrolApi';

const PATROL_KEYS = {
  status: ['swarm-status'] as const,
  flags: ['swarm-flags'] as const,
  pheromones: ['pheromones'] as const,
  sweeps: ['swarms'] as const,
};

export function useSwarmStatus() {
  return useQuery({
    queryKey: PATROL_KEYS.status,
    queryFn: patrolApi.getSwarmStatus,
    refetchInterval: (query) =>
      query.state.status === 'error' ? 60_000 : 5_000,
  });
}

export function useFlags() {
  return useQuery({
    queryKey: PATROL_KEYS.flags,
    queryFn: patrolApi.getFlags,
    refetchInterval: (query) =>
      query.state.status === 'error' ? 60_000 : 10_000,
  });
}

export function usePheromones() {
  return useQuery({
    queryKey: PATROL_KEYS.pheromones,
    queryFn: patrolApi.getPheromones,
    refetchInterval: (query) =>
      query.state.status === 'error' ? 60_000 : 5_000,
  });
}

export function useSweeps() {
  return useQuery({
    queryKey: PATROL_KEYS.sweeps,
    queryFn: patrolApi.getSweeps,
    refetchInterval: 30_000,
  });
}

export function useTriggerSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patrolApi.triggerSweep,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PATROL_KEYS.status });
      qc.invalidateQueries({ queryKey: PATROL_KEYS.flags });
      qc.invalidateQueries({ queryKey: PATROL_KEYS.pheromones });
      qc.invalidateQueries({ queryKey: PATROL_KEYS.sweeps });
    },
  });
}
