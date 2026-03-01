'use client';

import { useState, useEffect, useRef } from 'react';
import type { ThoughtMessage } from '../../types';

/**
 * Subscribe to patrol swarm SSE stream and accumulate thought messages.
 */
export function usePatrolStream(enabled: boolean): ThoughtMessage[] {
  const [messages, setMessages] = useState<ThoughtMessage[]>([]);
  const keyRef = useRef(0);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource('/api/swarm/stream');
    sourceRef.current = es;

    const handler = (event: string, dataStr: string) => {
      try {
        const data = JSON.parse(dataStr || '{}') as Record<string, unknown>;
        let msg: ThoughtMessage | null = null;
        if (event === 'flag') {
          const summary = (data.referral_summary as string) || 'Patrol flag raised';
          const target = (data.target_agent_id as string) || 'agent';
          msg = { id: `p-${++keyRef.current}`, source: 'PATROL', message: `${summary} — target: ${target}` };
        } else if (event === 'sweep_complete') {
          const cycle = data.cycle ?? data.cycle_number ?? '?';
          msg = { id: `p-${++keyRef.current}`, source: 'PATROL', message: `Sweep cycle ${cycle} complete` };
        }
        if (msg) {
          setMessages((prev) => [...prev.slice(-99), msg!]);
        }
      } catch {
        // Ping or invalid JSON — ignore
      }
    };

    es.addEventListener('flag', (e) => handler('flag', (e as MessageEvent).data));
    es.addEventListener('sweep_complete', (e) => handler('sweep_complete', (e as MessageEvent).data));

    return () => {
      es.close();
      sourceRef.current = null;
    };
  }, [enabled]);

  return messages;
}

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

/** Combined thought messages from patrol + investigation streams. */
export function useThoughtStream(useMocks: boolean): ThoughtMessage[] {
  const enabled = !useMocks;
  const patrolMessages = usePatrolStream(enabled);
  const investigationMessages = useInvestigationStream(enabled);
  return [...patrolMessages, ...investigationMessages];
}
