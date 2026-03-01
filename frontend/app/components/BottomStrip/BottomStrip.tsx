'use client';

import { useState } from 'react';
import { IncidentFeed } from './IncidentFeed';
import { ThoughtStream } from './ThoughtStream';

interface BottomStripProps {
  useMocks?: boolean;
  agentIds?: string[];
  agentNames?: Record<string, string>;
}

/** Collapsible bottom strip with IncidentFeed and ThoughtStream. */
export function BottomStrip({ useMocks = false, agentIds = [], agentNames = {} }: BottomStripProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`flex flex-col border-t border-[#1f2937] bg-[#0d1117] transition-all duration-200 ${
        expanded ? 'h-[160px] min-h-[120px]' : 'h-8'
      }`}
    >
      <button
        onClick={() => setExpanded((e) => !e)}
        className="h-8 flex items-center justify-between px-3 border-b border-[#1f2937] hover:bg-[#1f2937]/50 transition-colors w-full"
      >
        <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold">
          Incidents & Thought Stream
        </span>
        <span className="text-[#6b7280] text-xs">
          {expanded ? '▼' : '▶'}
        </span>
      </button>
      {expanded && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="flex-1 min-w-0 border-r border-[#1f2937]">
            <IncidentFeed useMocks={useMocks} agentIds={agentIds} agentNames={agentNames} />
          </div>
          <div className="flex-1 min-w-0">
            <ThoughtStream useMocks={useMocks} />
          </div>
        </div>
      )}
    </div>
  );
}
