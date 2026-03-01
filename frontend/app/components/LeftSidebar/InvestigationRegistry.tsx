'use client';

import { useState } from 'react';
import type { CaseFile } from '../../types';

interface InvestigationRegistryProps {
  cases: CaseFile[];
  selectedCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  isLoading?: boolean;
}

const verdictColors: Record<string, string> = {
  guilty: 'bg-[#ff3355]/20 text-[#ff3355] border-[#ff3355]/30',
  not_guilty: 'bg-[#00c853]/20 text-[#00c853] border-[#00c853]/30',
  under_watch: 'bg-[#ffaa00]/20 text-[#ffaa00] border-[#ffaa00]/30',
};

const verdictLabels: Record<string, string> = {
  guilty: 'Violation',
  not_guilty: 'False Positive',
  under_watch: 'Inconclusive',
};

const statusColors: Record<string, string> = {
  open: '#ffaa00',
  in_progress: '#00d4ff',
  concluded: '#6b7280',
};

const statusLabels: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  concluded: 'Concluded',
};

const severityColors: Record<string, string> = {
  low: '#00c853',
  medium: '#ffaa00',
  high: '#ff6b35',
  critical: '#ff3355',
  none: '#6b7280',
};

function formatTimeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function InvestigationRegistry({ cases, selectedCaseId, onSelectCase, isLoading }: InvestigationRegistryProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'concluded'>('all');

  const filteredCases = cases.filter(c => {
    if (filter === 'all') return true;
    if (filter === 'open') return c.status === 'open' || c.status === 'in_progress';
    return c.status === 'concluded';
  });

  const openCount = cases.filter(c => c.status === 'open' || c.status === 'in_progress').length;
  const concludedCount = cases.filter(c => c.status === 'concluded').length;

  return (
    <div className="h-full flex flex-col bg-[#111827] border-r border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
          Cases
        </h2>
      </div>

      {/* Filter Tabs */}
      <div className="px-2 py-2 border-b border-[#1f2937] flex gap-1">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 text-[10px] py-1 px-1.5 rounded transition-colors ${
            filter === 'all'
              ? 'bg-[#1f2937] text-white'
              : 'text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          All ({cases.length})
        </button>
        <button
          onClick={() => setFilter('open')}
          className={`flex-1 text-[10px] py-1 px-1.5 rounded transition-colors ${
            filter === 'open'
              ? 'bg-[#1f2937] text-[#00d4ff]'
              : 'text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          Active ({openCount})
        </button>
        <button
          onClick={() => setFilter('concluded')}
          className={`flex-1 text-[10px] py-1 px-1.5 rounded transition-colors ${
            filter === 'concluded'
              ? 'bg-[#1f2937] text-white'
              : 'text-[#6b7280] hover:text-[#9ca3af]'
          }`}
        >
          Closed ({concludedCount})
        </button>
      </div>

      {/* Case List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-6 text-center text-[10px] text-[#6b7280]">
            Loading cases...
          </div>
        )}
        {!isLoading && filteredCases.map((caseFile) => {
          const isSelected = selectedCaseId === caseFile.investigationId;

          return (
            <button
              key={caseFile.investigationId}
              onClick={() => onSelectCase(caseFile.investigationId)}
              className={`w-full px-3 py-2.5 text-left transition-colors border-l-2 border-b border-b-[#1f2937]/50 ${
                isSelected
                  ? 'bg-[#1f2937] border-l-[#9b59b6]'
                  : 'border-l-transparent hover:bg-[#1a2332]'
              }`}
            >
              {/* Case Header */}
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-semibold text-[#9ca3af]">
                  {caseFile.investigationId}
                </span>
                <div className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: statusColors[caseFile.status] }}
                  />
                  <span className="text-[9px] text-[#6b7280]">
                    {statusLabels[caseFile.status]}
                  </span>
                </div>
              </div>

              {/* Target Agent */}
              <div className="text-xs text-[#e0e6ed] mb-1 truncate">
                {caseFile.targetAgentId}
              </div>

              {/* Crime Classification */}
              <div className="text-[9px] text-[#6b7280] mb-1.5 truncate font-mono">
                {caseFile.crimeClassification?.replace(/_/g, ' ') ?? 'unknown'}
              </div>

              {/* Bottom Row: Verdict + Severity + Time */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Severity */}
                <span
                  className="text-[9px] px-1 py-0.5 rounded font-semibold"
                  style={{
                    color: severityColors[caseFile.damageReport?.damageSeverity ?? 'none'],
                    backgroundColor: `${severityColors[caseFile.damageReport?.damageSeverity ?? 'none']}20`,
                  }}
                >
                  {caseFile.damageReport?.damageSeverity ?? 'none'}
                </span>

                {/* Verdict */}
                <span
                  className={`text-[9px] px-1 py-0.5 rounded border ${
                    verdictColors[caseFile.verdict]
                  }`}
                >
                  {verdictLabels[caseFile.verdict]}
                </span>

                {/* Time */}
                <span className="text-[9px] text-[#6b7280] ml-auto">
                  {formatTimeAgo(
                    caseFile.concludedAt ?? new Date().toISOString(),
                  )}
                </span>
              </div>

              {/* Confidence Bar */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-[#1f2937] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(caseFile.confidence * 100).toFixed(0)}%`,
                      backgroundColor:
                        caseFile.confidence >= 0.8
                          ? '#00c853'
                          : caseFile.confidence >= 0.6
                          ? '#ffaa00'
                          : '#ff3355',
                    }}
                  />
                </div>
                <span className="text-[9px] text-[#6b7280] font-mono">
                  {(caseFile.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </button>
          );
        })}

        {filteredCases.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] text-[#6b7280]">
            No cases match filter
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="px-3 py-2 border-t border-[#1f2937] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div key="active-stat" className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]" />
            <span className="text-[9px] text-[#6b7280]">{openCount} active</span>
          </div>
          <div key="closed-stat" className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#6b7280]" />
            <span className="text-[9px] text-[#6b7280]">{concludedCount} closed</span>
          </div>
        </div>
        <span className="text-[9px] text-[#6b7280] font-mono">{cases.length} total</span>
      </div>
    </div>
  );
}
