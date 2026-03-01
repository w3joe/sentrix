'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as investigationApi from '../../lib/api/investigationApi';
import { adaptCaseFile } from '../../lib/adapters';

const INV_KEYS = {
  health: ['investigation-health'] as const,
  list: ['investigation-list'] as const,
  detail: (id: string) => ['investigation-detail', id] as const,
};

export function useInvestigationHealth() {
  return useQuery({
    queryKey: INV_KEYS.health,
    queryFn: investigationApi.getHealth,
    refetchInterval: 60_000,
  });
}

export function useInvestigationList() {
  return useQuery({
    queryKey: INV_KEYS.list,
    queryFn: investigationApi.listInvestigations,
    refetchInterval: 15_000,
  });
}

export function useInvestigationDetail(investigationId: string | null) {
  return useQuery({
    queryKey: INV_KEYS.detail(investigationId ?? ''),
    queryFn: () => investigationApi.getInvestigation(investigationId!),
    enabled: !!investigationId,
    refetchInterval: (query) => {
      const status = (query.state.data as Record<string, unknown>)?.status;
      if (status === 'concluded' || status === 'error') return false;
      if (status === 'in_progress' || status === 'open') return 3_000;
      return 10_000;
    },
    select: (data) => {
      const d = data as Record<string, unknown>;
      const cf = d.case_file as Record<string, unknown> | null;
      return {
        investigationId: d.investigation_id,
        status: d.status,
        verdict: d.verdict,
        sentence: d.sentence,
        error: d.error,
        caseFile: cf ? adaptCaseFile(cf) : null,
      };
    },
  });
}

// Bridge DB also stores investigations; invalidate so useCaseFiles picks up new/concluded ones
const BRIDGE_INVESTIGATIONS_KEY = ['investigations'] as const;

export function useStartInvestigation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: investigationApi.startInvestigation,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: INV_KEYS.list });
      qc.invalidateQueries({ queryKey: BRIDGE_INVESTIGATIONS_KEY });
      qc.setQueryData(INV_KEYS.detail(data.investigation_id), {
        investigation_id: data.investigation_id,
        status: data.status,
        error: null,
        case_file: null,
      });
    },
  });
}
