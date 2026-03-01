'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { ThoughtMessage } from '../../types';
import type { SweepResult } from '../../types';
import { useSweeps } from './usePatrolQueries';
import { useInvestigationList } from './useInvestigationQueries';

/**
 * Subscribe to investigation SSE stream and accumulate thought messages.
 */
export function useInvestigationStream(enabled: boolean): ThoughtMessage[] {
  const [messages, setMessages] = useState<ThoughtMessage[]>([]);
  const keyRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/investigation/stream');

    const handler = (event: string, dataStr: string) => {
      try {
        const data = JSON.parse(dataStr || '{}') as Record<string, unknown>;
        let msg: ThoughtMessage | null = null;
        if (event === 'investigation_started') {
          const target = (data.target_agent_id as string) || 'agent';
          msg = { id: `i-${++keyRef.current}`, source: 'INVESTIGATOR', message: `Investigation started for ${target}` };
        } else if (event === 'stage_complete') {
          const stage = (data.stage as string) || 'stage';
          msg = { id: `i-${++keyRef.current}`, source: 'INVESTIGATOR', message: `Stage complete: ${stage}` };
        } else if (event === 'investigation_concluded') {
          const verdict = (data.verdict as string) || 'concluded';
          msg = { id: `i-${++keyRef.current}`, source: 'INVESTIGATOR', message: `Investigation concluded: ${verdict}` };
        } else if (event === 'investigation_error') {
          const err = (data.error as string) || 'Unknown error';
          msg = { id: `i-${++keyRef.current}`, source: 'INVESTIGATOR', message: `Error: ${err}` };
        }
        if (msg) {
          setMessages((prev) => [...prev.slice(-99), msg]);
        }
      } catch {}
    };

    es.addEventListener('investigation_started', (e) => handler('investigation_started', (e as MessageEvent).data));
    es.addEventListener('stage_complete', (e) => handler('stage_complete', (e as MessageEvent).data));
    es.addEventListener('investigation_concluded', (e) => handler('investigation_concluded', (e as MessageEvent).data));
    es.addEventListener('investigation_error', (e) => handler('investigation_error', (e as MessageEvent).data));

    return () => es.close();
  }, [enabled]);

  return messages;
}

function sweepsToThoughtMessages(sweeps: SweepResult[]): ThoughtMessage[] {
  const seen = new Set<string>();
  const deduped = sweeps.filter((s) => {
    const id = s.sweep_id ?? `cycle-${s.cycle_number}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return deduped.map((s, i) => {
    const n = s.agents_scanned?.length ?? 0;
    const dur = (s.duration_ms / 1000).toFixed(1);
    const parts = [`cycle ${s.cycle_number}`, `${n} agents scanned`];
    if ((s.signals_posted ?? 0) > 0) parts.push(`${s.signals_posted} signals`);
    if ((s.flags_produced ?? 0) > 0) parts.push(`${s.flags_produced} flags`);
    parts.push(`(${dur}s)`);
    return {
      id: `sweep-${s.sweep_id ?? `${s.cycle_number}-${i}`}`,
      source: 'PATROL',
      message: `Sweep ${parts.join(', ')}`,
    };
  });
}

interface InvestigationRecord {
  investigation_id: string;
  target_agent_id?: string;
  status?: string;
  verdict?: string;
  severity_score?: number;
}

function investigationsToThoughtMessages(
  investigations: InvestigationRecord[],
): ThoughtMessage[] {
  const seen = new Set<string>();
  const deduped = investigations.filter((inv) => {
    if (seen.has(inv.investigation_id)) return false;
    seen.add(inv.investigation_id);
    return true;
  });
  return deduped.map((inv) => {
    const target = inv.target_agent_id ?? 'agent';
    const status = inv.status ?? 'unknown';
    const parts = [`target: ${target}`, `status: ${status}`];
    if (inv.verdict) parts.push(`verdict: ${inv.verdict}`);
    if (inv.severity_score != null) parts.push(`severity: ${inv.severity_score}`);
    return {
      id: `inv-${inv.investigation_id}`,
      source: 'INVESTIGATOR',
      message: `Investigation ${parts.join(', ')}`,
    };
  });
}

/** Combined thought messages from sweeps REST, investigation list REST, and investigation stream. */
export function useThoughtStream(useMocks: boolean): ThoughtMessage[] {
  const enabled = !useMocks;
  const investigationMessages = useInvestigationStream(enabled);
  const { data: sweeps = [] } = useSweeps();
  const { data: invList } = useInvestigationList();
  const sweepMessages = useMemo(
    () => sweepsToThoughtMessages(sweeps as SweepResult[]),
    [sweeps],
  );
  const investigationListMessages = useMemo(
    () =>
      investigationsToThoughtMessages(
        (invList?.investigations ?? []) as InvestigationRecord[],
      ),
    [invList],
  );
  return [
    ...sweepMessages,
    ...investigationListMessages,
    ...investigationMessages,
  ];
}
