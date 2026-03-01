'use client';

import { useEffect, useRef, useState } from 'react';
import { useFlags } from './api/usePatrolQueries';
import { adaptIncidentFromFlag } from '../lib/adapters';
import type { Incident } from '../types';

export interface PatrolNotification extends Incident {
  dismissedAt?: number;
}

/**
 * Detects newly added patrol flags by comparing the current flag list
 * against the previously seen set of flag IDs. Emits one notification
 * per new flag so the banner can display them sequentially.
 */
export function usePatrolFlagNotifications() {
  const { data: flags = [] } = useFlags();
  const seenIds = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<PatrolNotification[]>([]);
  const [current, setCurrent] = useState<PatrolNotification | null>(null);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!Array.isArray(flags) || flags.length === 0) return;

    const incoming = flags as Record<string, unknown>[];

    // On the very first load, just seed seenIds without notifying
    if (!isInitialized.current) {
      incoming.forEach((f) => {
        const id = (f.flag_id as string) || '';
        if (id) seenIds.current.add(id);
      });
      isInitialized.current = true;
      return;
    }

    const newFlags = incoming.filter((f) => {
      const id = (f.flag_id as string) || '';
      return id && !seenIds.current.has(id);
    });

    if (newFlags.length === 0) return;

    newFlags.forEach((f) => {
      const id = (f.flag_id as string) || '';
      if (id) seenIds.current.add(id);
    });

    const newNotifications: PatrolNotification[] = newFlags.map((f) =>
      adaptIncidentFromFlag(f)
    );

    setQueue((prev) => [...prev, ...newNotifications]);
  }, [flags]);

  // Advance queue: show next notification when current is dismissed
  useEffect(() => {
    if (current !== null) return;
    if (queue.length === 0) return;
    const [next, ...rest] = queue;
    setCurrent(next);
    setQueue(rest);
  }, [current, queue]);

  const dismiss = () => setCurrent(null);

  const testNotify = (severity: 'critical' | 'warning' | 'clear' = 'critical') => {
    const fake: PatrolNotification = {
      id: `test-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      severity,
      agentId: 'c1-email',
      agentName: 'c1-email',
      message: '[TEST] Patrol detected anomalous outbound data transfer',
    };
    setQueue((prev) => [...prev, fake]);
  };

  return { notification: current, dismiss, testNotify };
}
