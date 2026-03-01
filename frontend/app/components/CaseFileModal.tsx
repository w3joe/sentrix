'use client';

import { useEffect, useMemo } from 'react';
import type { CaseFile } from '../types';
import { useInvestigationDetail } from '../hooks/api/useInvestigationQueries';

interface CaseFileModalProps {
  caseFile: CaseFile;
  onClose: () => void;
  onClear?: (agentId: string) => void;
  onRestrict?: (agentId: string) => void;
  onSuspend?: (agentId: string) => void;
  /** When true, poll Investigation service for live in-progress updates */
  useLiveDetail?: boolean;
}

const severityColors: Record<string, string> = {
  critical: '#ff3355',
  high: '#ff6b35',
  medium: '#ffaa00',
  low: '#00c853',
  none: '#6b7280',
};

const verdictConfig: Record<string, { label: string; color: string; glow: string }> = {
  guilty:      { label: 'GUILTY',      color: '#ff3355', glow: 'rgba(255,51,85,0.15)' },
  not_guilty:  { label: 'NOT GUILTY',  color: '#00c853', glow: 'rgba(0,200,83,0.15)' },
  under_watch: { label: 'UNDER WATCH', color: '#ffaa00', glow: 'rgba(255,170,0,0.15)' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  concluded:   { label: 'CONCLUDED',   color: '#6b7280' },
  in_progress: { label: 'IN PROGRESS', color: '#00d4ff' },
  open:        { label: 'OPEN',        color: '#ffaa00' },
};

export function CaseFileModal({ caseFile, onClose, onClear, onRestrict, onSuspend, useLiveDetail = false }: CaseFileModalProps) {
  const { data: liveDetail } = useInvestigationDetail(useLiveDetail ? caseFile.investigationId : null);

  const effectiveCaseFile = useMemo(() => {
    if (!useLiveDetail || !liveDetail?.caseFile) return caseFile;
    const live = liveDetail.caseFile;
    return {
      ...caseFile,
      status: (liveDetail.status as CaseFile['status']) ?? caseFile.status,
      verdict: (liveDetail.verdict as CaseFile['verdict']) ?? caseFile.verdict,
      ...(live && {
        summary: live.summary || caseFile.summary,
        keyFindings: live.keyFindings?.length ? live.keyFindings : caseFile.keyFindings,
        investigatorReport: live.investigatorReport ?? caseFile.investigatorReport,
        damageReport: live.damageReport ?? caseFile.damageReport,
        networkAnalysis: live.networkAnalysis ?? caseFile.networkAnalysis,
        evidenceSummary: live.evidenceSummary || caseFile.evidenceSummary,
      }),
    };
  }, [caseFile, liveDetail, useLiveDetail]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const verdict = verdictConfig[effectiveCaseFile.verdict] ?? verdictConfig.under_watch;
  const status = statusConfig[effectiveCaseFile.status] ?? statusConfig.open;
  const severity = effectiveCaseFile.damageReport?.damageSeverity ?? 'none';
  const severityColor = severityColors[severity];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div
        className="relative z-10 w-[820px] max-h-[88vh] flex flex-col bg-[#0a0e1a] border border-[#1f2937] rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f2937] bg-[#0d1117]">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 rounded-full" style={{ backgroundColor: verdict.color }} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#4b5563] uppercase tracking-wider">Case File</span>
                  <span className="text-[10px] font-mono text-[#6b7280]">{caseFile.investigationId}</span>
                </div>
                <div className="text-base font-bold text-white font-mono truncate">
                  {effectiveCaseFile.targetAgentId || '—'}
                </div>
              </div>
            </div>
            <span
              className="text-[10px] font-mono px-2 py-0.5 rounded-full border"
              style={{ color: status.color, borderColor: status.color + '60', backgroundColor: status.color + '15' }}
            >
              {status.label}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1f2937] text-[#ff6b35]">
              {effectiveCaseFile.crimeClassification.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="text-[#4b5563] hover:text-white transition-colors ml-4 flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* ── Verdict banner ── */}
        <div
          className="flex items-center justify-between px-6 py-3 border-b border-[#1f2937]"
          style={{ backgroundColor: verdict.glow }}
        >
          <div className="flex items-center gap-6">
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[#6b7280] mb-0.5">Verdict</div>
              <span className="text-lg font-black" style={{ color: verdict.color }}>{verdict.label}</span>
            </div>
            <div className="w-px h-8 bg-[#1f2937]" />
            <div>
              <div className="text-[9px] uppercase tracking-wider text-[#6b7280] mb-0.5">Severity Score</div>
              <span className="text-lg font-black text-[#00d4ff]">{effectiveCaseFile.severityScore}<span className="text-sm font-normal text-[#4b5563]">/10</span></span>
            </div>
            <div className="w-px h-8 bg-[#1f2937]" />
            <div className="flex-1 min-w-[140px]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] uppercase tracking-wider text-[#6b7280]">Confidence</span>
                <span className="text-[11px] font-mono text-[#a0aec0]">{(effectiveCaseFile.confidence * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-[#1f2937] rounded-full w-36 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(effectiveCaseFile.confidence * 100).toFixed(0)}%`,
                    backgroundColor: effectiveCaseFile.confidence >= 0.8 ? '#00c853' : effectiveCaseFile.confidence >= 0.6 ? '#ffaa00' : '#ff3355',
                  }}
                />
              </div>
            </div>
          </div>
          {effectiveCaseFile.concludedAt && (
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-wider text-[#6b7280] mb-0.5">Concluded</div>
              <div className="text-xs font-mono text-[#6b7280]">{new Date(effectiveCaseFile.concludedAt).toLocaleString()}</div>
            </div>
          )}
        </div>

        {/* ── Operator action: Clear / Restrict / Suspend ── */}
        {effectiveCaseFile.targetAgentId && (onClear || onRestrict || onSuspend) && (
          <div className="px-6 py-4 border-b border-[#1f2937] bg-[#0d1117] flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold shrink-0">
              Operator action
            </span>
            <div className="flex gap-2 flex-wrap">
              {onClear && (
                <button
                  onClick={() => {
                    onClear(effectiveCaseFile.targetAgentId);
                    onClose();
                  }}
                  className="px-4 py-2 rounded text-xs font-semibold transition-all border border-[#00c853]/50 bg-[#00c853]/10 text-[#00c853] hover:bg-[#00c853]/20"
                >
                  Clear
                </button>
              )}
              {onRestrict && (
                <button
                  onClick={() => {
                    onRestrict(effectiveCaseFile.targetAgentId);
                    onClose();
                  }}
                  className="px-4 py-2 rounded text-xs font-semibold transition-all border border-[#ffaa00]/50 bg-[#ffaa00]/10 text-[#ffaa00] hover:bg-[#ffaa00]/20"
                >
                  Restrict
                </button>
              )}
              {onSuspend && (
                <button
                  onClick={() => {
                    onSuspend(effectiveCaseFile.targetAgentId);
                    onClose();
                  }}
                  className="px-4 py-2 rounded text-xs font-semibold transition-all border border-[#ff3355]/50 bg-[#ff3355]/10 text-[#ff3355] hover:bg-[#ff3355]/20"
                >
                  Suspend
                </button>
              )}
            </div>
            <span className="text-[9px] text-[#4b5563] ml-auto">
              Updates agent status and closes case
            </span>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-4">

            {/* Summary */}
            {effectiveCaseFile.summary && (
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937]">
                <div className="text-[9px] uppercase tracking-wider text-[#6b7280] mb-2 font-semibold">Case Summary</div>
                <p className="text-sm text-[#c9d1d9] leading-relaxed">{effectiveCaseFile.summary}</p>
              </div>
            )}

            {/* Key Findings */}
            {effectiveCaseFile.keyFindings?.length > 0 && (
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937]">
                <div className="text-[9px] uppercase tracking-wider text-[#00d4ff] mb-3 font-semibold">Key Findings</div>
                <div className="grid grid-cols-1 gap-1.5">
                  {effectiveCaseFile.keyFindings!.map((f, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm text-[#a0aec0]">
                      <span className="text-[#00d4ff] font-mono text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Two-column: Investigator + Damage */}
            <div className="grid grid-cols-2 gap-4">
              {/* Investigator Report */}
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937] space-y-3">
                <div className="text-[9px] uppercase tracking-wider text-[#9b59b6] font-semibold">Investigator Report</div>
                {effectiveCaseFile.investigatorReport?.caseFacts ? (
                  <p className="text-sm text-[#a0aec0] leading-relaxed">{effectiveCaseFile.investigatorReport!.caseFacts}</p>
                ) : (
                  <p className="text-sm text-[#4b5563] italic">No case facts on record.</p>
                )}
                {effectiveCaseFile.investigatorReport?.relevantLogIds?.length > 0 && (
                  <div className="pt-2 border-t border-[#1f2937]">
                    <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mb-1">Related Logs</div>
                    <div className="flex flex-wrap gap-1">
                      {effectiveCaseFile.investigatorReport!.relevantLogIds!.map((id) => (
                        <span key={id} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#9b59b6]/10 text-[#9b59b6] border border-[#9b59b6]/20">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Damage Assessment */}
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937] space-y-3">
                <div className="text-[9px] uppercase tracking-wider text-[#ffaa00] font-semibold">Damage Assessment</div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-sm font-bold px-2.5 py-1 rounded"
                    style={{ color: severityColor, backgroundColor: severityColor + '20' }}
                  >
                    {severity.toUpperCase()}
                  </span>
                  {effectiveCaseFile.damageReport?.propagationRisk && (
                    <div className="text-xs">
                      <span className="text-[#6b7280]">Propagation: </span>
                      <span className="text-[#a0aec0]">{effectiveCaseFile.damageReport!.propagationRisk}</span>
                    </div>
                  )}
                </div>
                {effectiveCaseFile.damageReport?.estimatedImpact && (
                  <p className="text-sm text-[#a0aec0] leading-relaxed">{effectiveCaseFile.damageReport!.estimatedImpact}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {effectiveCaseFile.damageReport?.dataExposureScope && (
                    <div>
                      <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mb-0.5">Exposure Scope</div>
                      <div className="text-[#ffaa00] font-mono">{effectiveCaseFile.damageReport!.dataExposureScope}</div>
                    </div>
                  )}
                  {effectiveCaseFile.damageReport?.affectedAgents?.length > 0 && (
                    <div>
                      <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mb-0.5">Affected Agents</div>
                      <div className="text-[#a0aec0] font-mono">{effectiveCaseFile.damageReport!.affectedAgents!.join(', ')}</div>
                    </div>
                  )}
                </div>
                {effectiveCaseFile.damageReport?.causalChain?.length > 0 && (
                  <div className="pt-2 border-t border-[#1f2937]">
                    <div className="text-[9px] text-[#6b7280] uppercase tracking-wider mb-1.5">Causal Chain</div>
                    <div className="space-y-1">
                      {effectiveCaseFile.damageReport!.causalChain!.map((link, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs flex-wrap">
                          <span className="text-[#ffaa00]">{link.cause}</span>
                          <span className="text-[#4b5563]">→</span>
                          <span className="text-[#ff6b35]">{link.effect}</span>
                          {link.evidence && <span className="text-[#4b5563]">({link.evidence})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Network / Flagged Comms */}
            {effectiveCaseFile.networkAnalysis?.flaggedRelevantMessages?.length > 0 && (
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937]">
                <div className="text-[9px] uppercase tracking-wider text-[#14b8a6] font-semibold mb-3">
                  Flagged Communications <span className="text-[#4b5563]">({effectiveCaseFile.networkAnalysis!.flaggedRelevantMessages!.length})</span>
                </div>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {effectiveCaseFile.networkAnalysis!.flaggedRelevantMessages!.map((msg) => (
                    <div key={msg.messageId} className="bg-[#111827] rounded-lg p-3 border border-[#1f2937]">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono text-[#14b8a6]">{msg.senderId} → {msg.recipientId}</span>
                        <span className="text-[9px] text-[#6b7280]">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-[#a0aec0]">{msg.bodySnippet}</p>
                      {msg.rationale && <p className="text-[10px] text-[#6b7280] mt-1 italic">{msg.rationale}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence Summary */}
            {effectiveCaseFile.evidenceSummary && (
              <div className="bg-[#0d1117] rounded-lg p-4 border border-[#1f2937]">
                <div className="text-[9px] uppercase tracking-wider text-[#6b7280] font-semibold mb-2">Evidence Summary</div>
                <p className="text-sm text-[#a0aec0] leading-relaxed">{effectiveCaseFile.evidenceSummary}</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
