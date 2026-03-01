'use client';

import { useMemo } from 'react';
import { useFlags } from '../../hooks/api/usePatrolQueries';
import { useAllViolationLogs } from '../../hooks/api/useBridgeQueries';
import { synthesizeIncidents } from '../../lib/adapters';
import { incidents as mockIncidents } from '../../data/mockData';

const severityColors: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-[#ff3355]/10', text: 'text-[#ff3355]', label: 'CRITICAL' },
  warning: { bg: 'bg-[#ffaa00]/10', text: 'text-[#ffaa00]', label: 'WARNING' },
  clear: { bg: 'bg-[#00c853]/10', text: 'text-[#00c853]', label: 'CLEAR' },
};

interface IncidentFeedProps {
  useMocks?: boolean;
  agentIds?: string[];
  agentNames?: Record<string, string>;
}

export function IncidentFeed({ useMocks = false, agentIds = [], agentNames = {} }: IncidentFeedProps) {
  const { data: flags = [], isLoading } = useFlags();
  const { data: violationLogs = [] } = useAllViolationLogs(useMocks ? [] : agentIds);
  const incidents = useMemo(() => {
    if (useMocks) return mockIncidents;
    return synthesizeIncidents(
      flags as Record<string, unknown>[],
      violationLogs,
      agentNames
    );
  }, [useMocks, flags, violationLogs, agentNames]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[#1f2937]">
        <h3 className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold">
          Incident Feed
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {isLoading && !useMocks && (
          <div className="text-[10px] text-[#6b7280] py-4 text-center">Loading...</div>
        )}
        {incidents.map((incident) => {
          const style = severityColors[incident.severity];
          return (
            <div
              key={incident.id}
              className={`text-xs font-mono px-2 py-1.5 rounded ${style.bg}`}
            >
              <span className="text-[#6b7280]">[{incident.timestamp}]</span>{' '}
              <span className={`${style.text} font-semibold`}>{style.label}</span>
              <span className="text-[#6b7280]"> — </span>
              <span className="text-[#00d4ff]">{incident.agentName}</span>
              <span className="text-[#6b7280]"> — </span>
              <span className="text-[#a0aec0]">{incident.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
