'use client';

import { useState, useCallback, useMemo } from 'react';
import type { TimeRange, TimelineEvent, AgentStatus } from '../types';
import { timelineEvents, agentStateHistory } from '../data/mockData';
import { useFlags } from './api/usePatrolQueries';
import { useSweeps } from './api/usePatrolQueries';
import { useAllViolationLogs } from './api/useBridgeQueries';
import { synthesizeIncidents } from '../lib/adapters';

const TIME_RANGE_MINUTES: Record<TimeRange, number> = {
  '1h': 60,
  '6h': 360,
  '24h': 1440,
};

function incidentsToTimelineEvents(
  incidents: Array<{ id: string; timestamp: string; severity: 'critical' | 'warning' | 'clear'; agentId: string; agentName: string; message: string }>
): TimelineEvent[] {
  return incidents.map((inc) => {
    let ts: Date;
    try {
      ts = new Date(inc.timestamp);
      if (Number.isNaN(ts.getTime())) ts = new Date();
    } catch {
      ts = new Date();
    }
    return {
      id: inc.id,
      timestamp: ts,
      type: 'incident',
      severity: inc.severity,
      agentId: inc.agentId,
      agentName: inc.agentName,
      message: inc.message,
    };
  });
}

function sweepToTimelineEvents(sweeps: Record<string, unknown>[]): TimelineEvent[] {
  return sweeps.map((s, i) => {
    const ts = (s.timestamp || s.cycle_end) as string | undefined;
    let date: Date;
    try {
      date = ts ? new Date(ts) : new Date();
      if (Number.isNaN(date.getTime())) date = new Date();
    } catch {
      date = new Date();
    }
    const cycle = (s.cycle ?? s.cycle_number ?? i) as number;
    return {
      id: `sweep-${cycle}-${i}`,
      timestamp: date,
      type: 'thought',
      source: 'SYSTEM',
      message: `Sweep cycle ${cycle} complete`,
    };
  });
}

export function useTimelineState(options?: { useMocks?: boolean; agentIds?: string[]; agentNames?: Record<string, string> }) {
  const { useMocks = false, agentIds = [], agentNames = {} } = options ?? {};
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [isLive, setIsLive] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  const { data: flags = [] } = useFlags();
  const { data: sweeps = [] } = useSweeps();
  const { data: violationLogs = [] } = useAllViolationLogs(useMocks ? [] : agentIds);

  const apiEvents = useMemo(() => {
    if (useMocks || (agentIds.length === 0 && flags.length === 0 && sweeps.length === 0)) return [];
    const incidents = synthesizeIncidents(
      flags as Record<string, unknown>[],
      violationLogs,
      agentNames
    );
    const fromIncidents = incidentsToTimelineEvents(incidents);
    const fromSweeps = sweepToTimelineEvents(sweeps as Record<string, unknown>[]);
    const combined = [...fromIncidents, ...fromSweeps];
    combined.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return combined;
  }, [useMocks, agentIds.length, flags, violationLogs, agentNames, sweeps]);

  const sourceEvents = useMocks ? timelineEvents : apiEvents;

  // Calculate start and end times based on time range
  const { startTime, endTime } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - TIME_RANGE_MINUTES[timeRange] * 60 * 1000);
    return { startTime: start, endTime: end };
  }, [timeRange]);

  // Get events filtered by current time range
  const filteredEvents = useMemo(() => {
    return sourceEvents
      .filter((event) => event.timestamp >= startTime && event.timestamp <= endTime)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [sourceEvents, startTime, endTime]);

  // Get events up to the current scrubber position
  const visibleEvents = useMemo(() => {
    if (isLive) {
      return filteredEvents;
    }
    return filteredEvents.filter((event) => event.timestamp <= currentTime);
  }, [filteredEvents, currentTime, isLive]);

  // Get agent states at the current time position
  const getAgentStatesAtTime = useCallback((time: Date): Record<string, AgentStatus> => {
    // Find the most recent state snapshot before or at the given time
    const sortedHistory = [...agentStateHistory].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    for (const snapshot of sortedHistory) {
      if (snapshot.timestamp <= time) {
        return snapshot.states;
      }
    }

    // Return idle state for all if no history found
    return { n1: 'idle', n2: 'idle', n3: 'idle', n4: 'idle', n5: 'idle', n6: 'idle' };
  }, []);

  // Current agent states based on timeline position
  const currentAgentStates = useMemo(() => {
    if (isLive) {
      return getAgentStatesAtTime(new Date());
    }
    return getAgentStatesAtTime(currentTime);
  }, [currentTime, isLive, getAgentStatesAtTime]);

  // Handle scrubber change (debounced at caller level)
  const handleScrubberChange = useCallback((time: Date) => {
    setIsLive(false);
    setCurrentTime(time);
  }, []);

  // Jump to live
  const jumpToLive = useCallback(() => {
    setIsLive(true);
    setCurrentTime(new Date());
  }, []);

  // Change time range
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
    // Reset to live when changing range
    setIsLive(true);
    setCurrentTime(new Date());
  }, []);

  // Calculate event density for heatmap (events per minute)
  const eventDensity = useMemo(() => {
    const totalMinutes = TIME_RANGE_MINUTES[timeRange];
    const bucketCount = 60; // Always show 60 buckets
    const minutesPerBucket = totalMinutes / bucketCount;

    const buckets: { minute: number; count: number; maxSeverity: 'critical' | 'warning' | 'clear' | null }[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = new Date(startTime.getTime() + i * minutesPerBucket * 60 * 1000);
      const bucketEnd = new Date(bucketStart.getTime() + minutesPerBucket * 60 * 1000);

      const bucketEvents = filteredEvents.filter(
        (e) => e.timestamp >= bucketStart && e.timestamp < bucketEnd
      );

      let maxSeverity: 'critical' | 'warning' | 'clear' | null = null;
      for (const event of bucketEvents) {
        if (event.severity === 'critical') {
          maxSeverity = 'critical';
          break;
        }
        if (event.severity === 'warning') {
          maxSeverity = 'warning';
        } else if (event.severity === 'clear' && maxSeverity === null) {
          maxSeverity = 'clear';
        }
      }

      buckets.push({
        minute: i,
        count: bucketEvents.length,
        maxSeverity,
      });
    }

    return buckets;
  }, [filteredEvents, startTime, timeRange]);

  // Get scrubber position as percentage (0-100)
  const scrubberPosition = useMemo(() => {
    if (isLive) return 100;
    const totalMs = endTime.getTime() - startTime.getTime();
    const currentMs = currentTime.getTime() - startTime.getTime();
    return Math.max(0, Math.min(100, (currentMs / totalMs) * 100));
  }, [currentTime, startTime, endTime, isLive]);

  // Convert percentage position to time
  const positionToTime = useCallback((percentage: number): Date => {
    const totalMs = endTime.getTime() - startTime.getTime();
    const targetMs = startTime.getTime() + (percentage / 100) * totalMs;

    // Snap to minute
    const targetDate = new Date(targetMs);
    targetDate.setSeconds(0, 0);

    return targetDate;
  }, [startTime, endTime]);

  return {
    timeRange,
    setTimeRange: handleTimeRangeChange,
    isLive,
    currentTime: isLive ? new Date() : currentTime,
    startTime,
    endTime,
    filteredEvents,
    visibleEvents,
    currentAgentStates,
    handleScrubberChange,
    jumpToLive,
    eventDensity,
    scrubberPosition,
    positionToTime,
  };
}
