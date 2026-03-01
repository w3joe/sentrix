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
// Timestamp when the page loaded — flags older than this are considered "already seen"
const PAGE_LOAD_TIME = Date.now();

/** Unlocks audio playback on first user interaction (required by browser autoplay policy) */
function useAudioUnlock() {
  const unlocked = useRef(false);

  useEffect(() => {
    const unlock = () => {
      if (unlocked.current) return;
      unlocked.current = true;
      try {
        const a = new Audio('/sound/notification.mp3');
        a.volume = 0;
        void a.play().catch(() => {});
      } catch {
        // ignore
      }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);

  return unlocked;
}

export function usePatrolFlagNotifications() {
  const { data: flags = [] } = useFlags();
  const seenIds = useRef<Set<string>>(new Set());
  const [queue, setQueue] = useState<PatrolNotification[]>([]);
  const [current, setCurrent] = useState<PatrolNotification | null>(null);
  const isInitialized = useRef(false);
  const audioUnlocked = useAudioUnlock();

  useEffect(() => {
    if (!Array.isArray(flags) || flags.length === 0) return;

    const incoming = flags as Record<string, unknown>[];

    if (!isInitialized.current) {
      // Seed only flags that existed before the page loaded (older than PAGE_LOAD_TIME)
      // Flags created after page load (e.g. a run that just finished) will still notify
      incoming.forEach((f) => {
        const id = (f.flag_id as string) || '';
        if (!id) return;
        const ts = (f.timestamp as string) || '';
        const flagTime = ts ? new Date(ts).getTime() : 0;
        if (flagTime < PAGE_LOAD_TIME) {
          seenIds.current.add(id);
        }
      });
      isInitialized.current = true;
      // Fall through so any new flags from this first fetch are processed below
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

    // Play notification sound only after user has interacted (browser autoplay policy)
    if (audioUnlocked.current) {
      try {
        const audio = new Audio('/sound/notification.mp3');
        void audio.play().catch((err) => console.warn('[PatrolNotify] Sound failed:', err));
      } catch (err) {
        console.warn('[PatrolNotify] Sound error:', err);
      }
    }
  }, [current, queue]);

  const dismiss = () => setCurrent(null);

  const testNotify = (
    severity: 'critical' | 'warning' | 'clear' = 'critical',
    agentId = 'c1-email',
  ) => {
    const fake: PatrolNotification = {
      id: `test-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      severity,
      agentId,
      agentName: agentId,
      message: '[TEST] Patrol detected anomalous outbound data transfer',
    };
    setQueue((prev) => [...prev, fake]);
  };

  return { notification: current, dismiss, testNotify };
}
