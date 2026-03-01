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

const severityColors: Record<string, { text: string; bg: string; border: string }> = {
  critical: { text: '#ff3355', bg: 'rgba(255,51,85,0.12)',  border: 'rgba(255,51,85,0.35)' },
  high:     { text: '#ff6b35', bg: 'rgba(255,107,53,0.12)', border: 'rgba(255,107,53,0.35)' },
  medium:   { text: '#ffaa00', bg: 'rgba(255,170,0,0.12)',  border: 'rgba(255,170,0,0.35)' },
  low:      { text: '#00c853', bg: 'rgba(0,200,83,0.12)',   border: 'rgba(0,200,83,0.35)' },
  none:     { text: '#6b7280', bg: 'rgba(107,114,128,0.12)',border: 'rgba(107,114,128,0.35)' },
};

const verdictConfig: Record<string, { label: string; color: string; bg: string; glow: string; icon: string }> = {
  guilty:      { label: 'GUILTY',      color: '#ff3355', bg: 'rgba(255,51,85,0.07)',  glow: '0 0 60px rgba(255,51,85,0.1)',  icon: '⚠' },
  not_guilty:  { label: 'NOT GUILTY',  color: '#00c853', bg: 'rgba(0,200,83,0.07)',   glow: '0 0 60px rgba(0,200,83,0.1)',   icon: '✓' },
  under_watch: { label: 'UNDER WATCH', color: '#ffaa00', bg: 'rgba(255,170,0,0.07)',  glow: '0 0 60px rgba(255,170,0,0.1)',  icon: '◉' },
};

const statusConfig: Record<string, { label: string; color: string }> = {
  concluded:   { label: 'CONCLUDED',   color: '#6b7280' },
  in_progress: { label: 'IN PROGRESS', color: '#00d4ff' },
  open:        { label: 'OPEN',        color: '#ffaa00' },
};

function SectionLabel({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-0.5 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[9px] font-mono uppercase tracking-[0.15em]" style={{ color }}>{children}</span>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#0c1020] rounded-xl p-4 border border-[#1a2235] ${className}`}>
      {children}
    </div>
  );
}

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
  const sev = severityColors[severity] ?? severityColors.none;
  const confidencePct = Math.round(effectiveCaseFile.confidence * 100);
  const confColor = effectiveCaseFile.confidence >= 0.8 ? '#00c853' : effectiveCaseFile.confidence >= 0.6 ? '#ffaa00' : '#ff3355';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      <div
        className="relative z-10 w-[860px] max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0b0f1d 0%, #080c17 100%)',
          border: '1px solid #1a2235',
          boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 40px 80px rgba(0,0,0,0.7), ${verdict.glow}`,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Top color accent */}
        <div
          className="h-0.5 w-full flex-shrink-0"
          style={{ background: `linear-gradient(90deg, ${verdict.color}, ${verdict.color}40 60%, transparent)` }}
        />

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a2235' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[9px] font-mono tracking-[0.12em] text-[#2e3d54] uppercase">Case File</span>
                <span className="text-[9px] text-[#2e3d54]">·</span>
                <span className="text-[9px] font-mono text-[#2e3d54] truncate max-w-[220px]">{caseFile.investigationId}</span>
              </div>
              <h1 className="text-lg font-bold tracking-tight text-white font-mono leading-none">{effectiveCaseFile.targetAgentId || '—'}</h1>
            </div>

            {/* Status pill */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium flex-shrink-0"
              style={{ color: status.color, background: status.color + '18', border: `1px solid ${status.color}40` }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: status.color, boxShadow: `0 0 5px ${status.color}` }}
              />
              {status.label}
            </div>

            {/* Crime classification tag */}
            <div
              className="px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase tracking-wider flex-shrink-0"
              style={{ color: '#ff6b35', background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.22)' }}
            >
              {effectiveCaseFile.crimeClassification.replace(/_/g, ' ')}
            </div>
          </div>

          <button
            onClick={onClose}
            className="ml-4 flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-[#374151] hover:text-white hover:bg-white/8 transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* ── Verdict strip ── */}
        <div
          className="flex items-stretch flex-shrink-0"
          style={{ background: verdict.bg, borderBottom: '1px solid #1a2235' }}
        >
          {/* Verdict */}
          <div className="flex items-center gap-3 px-6 py-3">
            <span className="text-xl leading-none" style={{ color: verdict.color }}>{verdict.icon}</span>
            <div>
              <div className="text-[8px] uppercase tracking-[0.15em] text-[#374151] mb-0.5">Verdict</div>
              <span
                className="text-base font-black tracking-wider"
                style={{ color: verdict.color, textShadow: `0 0 20px ${verdict.color}50` }}
              >
                {verdict.label}
              </span>
            </div>
          </div>

          <div className="w-px bg-[#1a2235] my-2.5" />

          {/* Severity Score */}
          <div className="flex items-center px-6 py-3">
            <div>
              <div className="text-[8px] uppercase tracking-[0.15em] text-[#374151] mb-0.5">Severity</div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-2xl font-black text-[#00d4ff]">{effectiveCaseFile.severityScore}</span>
                <span className="text-xs text-[#2e3d54] font-mono">/10</span>
              </div>
            </div>
          </div>

          <div className="w-px bg-[#1a2235] my-2.5" />

          {/* Confidence bar */}
          <div className="flex items-center px-6 py-3 min-w-[180px]">
            <div className="w-full">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[8px] uppercase tracking-[0.15em] text-[#374151]">Confidence</span>
                <span className="text-sm font-bold font-mono" style={{ color: confColor }}>{confidencePct}%</span>
              </div>
              <div className="h-1 bg-[#141c2e] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${confidencePct}%`,
                    background: `linear-gradient(90deg, ${confColor}70, ${confColor})`,
                    boxShadow: `0 0 8px ${confColor}50`,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Concluded timestamp */}
          {effectiveCaseFile.concludedAt && (
            <>
              <div className="w-px bg-[#1a2235] my-2.5 ml-auto" />
              <div className="flex items-center px-6 py-3">
                <div className="text-right">
                  <div className="text-[8px] uppercase tracking-[0.15em] text-[#374151] mb-0.5">Concluded</div>
                  <div className="text-xs font-mono text-[#4b5563]">{new Date(effectiveCaseFile.concludedAt).toLocaleString()}</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Operator Actions ── */}
        {effectiveCaseFile.targetAgentId && (onClear || onRestrict || onSuspend) && (
          <div
            className="px-5 py-3 flex items-center gap-3 flex-shrink-0"
            style={{ background: '#09111e', borderBottom: '1px solid #1a2235' }}
          >
            <span className="text-[9px] uppercase tracking-[0.12em] text-[#2e3d54] font-semibold shrink-0">Operator</span>
            <div className="flex gap-2 flex-wrap flex-1">
              {onClear && (
                <button
                  onClick={() => { onClear(effectiveCaseFile.targetAgentId); onClose(); }}
                  className="px-3.5 py-1.5 rounded-lg text-[10px] font-semibold font-mono transition-all"
                  style={{ color: '#00c853', background: 'rgba(0,200,83,0.08)', border: '1px solid rgba(0,200,83,0.25)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,200,83,0.16)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,200,83,0.08)')}
                >
                  Clear
                </button>
              )}
              {onRestrict && (
                <button
                  onClick={() => { onRestrict(effectiveCaseFile.targetAgentId); onClose(); }}
                  className="px-3.5 py-1.5 rounded-lg text-[10px] font-semibold font-mono transition-all"
                  style={{ color: '#ffaa00', background: 'rgba(255,170,0,0.08)', border: '1px solid rgba(255,170,0,0.25)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,170,0,0.16)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,170,0,0.08)')}
                >
                  Restrict
                </button>
              )}
              {onSuspend && (
                <button
                  onClick={() => { onSuspend(effectiveCaseFile.targetAgentId); onClose(); }}
                  className="px-3.5 py-1.5 rounded-lg text-[10px] font-semibold font-mono transition-all"
                  style={{ color: '#ff3355', background: 'rgba(255,51,85,0.08)', border: '1px solid rgba(255,51,85,0.25)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,51,85,0.16)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,51,85,0.08)')}
                >
                  Suspend
                </button>
              )}
            </div>
            <span className="text-[9px] text-[#2e3d54] shrink-0">Updates agent status · closes case</span>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-5 space-y-3">

            {/* Summary */}
            {effectiveCaseFile.summary && (
              <Card>
                <SectionLabel color="#4b5563">Case Summary</SectionLabel>
                <p className="text-sm text-[#c9d1d9] leading-relaxed">{effectiveCaseFile.summary}</p>
              </Card>
            )}

            {/* Key Findings */}
            {effectiveCaseFile.keyFindings?.length > 0 && (
              <Card>
                <SectionLabel color="#00d4ff">Key Findings</SectionLabel>
                <div className="space-y-2">
                  {effectiveCaseFile.keyFindings!.map((f, i) => (
                    <div key={i} className="flex items-start gap-3 group">
                      <span className="text-[10px] font-mono font-bold flex-shrink-0 mt-0.5 w-5 text-center" style={{ color: '#00d4ff' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 text-sm text-[#9baab8] leading-relaxed py-0.5 pl-2.5 border-l border-[#1a2235] group-hover:border-[#00d4ff]/30 transition-colors">
                        {f}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Two-column: Investigator + Damage */}
            <div className="grid grid-cols-2 gap-3">

              {/* Investigator Report */}
              <Card>
                <SectionLabel color="#9b59b6">Investigator Report</SectionLabel>
                {effectiveCaseFile.investigatorReport?.caseFacts ? (
                  <p className="text-sm text-[#9baab8] leading-relaxed">{effectiveCaseFile.investigatorReport!.caseFacts}</p>
                ) : (
                  <p className="text-sm text-[#2e3d54] italic">No case facts on record.</p>
                )}
                {effectiveCaseFile.investigatorReport?.relevantLogIds?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#1a2235]">
                    <div className="text-[8px] text-[#374151] uppercase tracking-wider mb-1.5">Related Logs</div>
                    <div className="flex flex-wrap gap-1">
                      {effectiveCaseFile.investigatorReport!.relevantLogIds!.map((id) => (
                        <span key={id} className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-[#9b59b6]/10 text-[#9b59b6] border border-[#9b59b6]/20">
                          {id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              {/* Damage Assessment */}
              <Card>
                <SectionLabel color="#ffaa00">Damage Assessment</SectionLabel>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-lg"
                    style={{ color: sev.text, background: sev.bg, border: `1px solid ${sev.border}` }}
                  >
                    {severity.toUpperCase()}
                  </span>
                  {effectiveCaseFile.damageReport?.propagationRisk && (
                    <span className="text-xs text-[#4b5563]">
                      Propagation: <span className="text-[#9baab8]">{effectiveCaseFile.damageReport!.propagationRisk}</span>
                    </span>
                  )}
                </div>
                {effectiveCaseFile.damageReport?.estimatedImpact && (
                  <p className="text-sm text-[#9baab8] leading-relaxed mb-3">{effectiveCaseFile.damageReport!.estimatedImpact}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  {effectiveCaseFile.damageReport?.dataExposureScope && (
                    <div className="bg-[#0a1018] rounded-lg px-2.5 py-2 border border-[#1a2235]">
                      <div className="text-[8px] text-[#374151] uppercase tracking-wider mb-0.5">Exposure Scope</div>
                      <div className="text-xs font-mono text-[#ffaa00]">{effectiveCaseFile.damageReport!.dataExposureScope}</div>
                    </div>
                  )}
                  {effectiveCaseFile.damageReport?.affectedAgents?.length > 0 && (
                    <div className="bg-[#0a1018] rounded-lg px-2.5 py-2 border border-[#1a2235]">
                      <div className="text-[8px] text-[#374151] uppercase tracking-wider mb-0.5">Affected Agents</div>
                      <div className="text-xs font-mono text-[#9baab8]">{effectiveCaseFile.damageReport!.affectedAgents!.join(', ')}</div>
                    </div>
                  )}
                </div>
                {effectiveCaseFile.damageReport?.causalChain?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#1a2235]">
                    <div className="text-[8px] text-[#374151] uppercase tracking-wider mb-2">Causal Chain</div>
                    <div className="space-y-1.5">
                      {effectiveCaseFile.damageReport!.causalChain!.map((link, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs">
                          <span className="text-[#ffaa00] font-mono">{link.cause}</span>
                          <span className="text-[#2e3d54] mt-0.5 flex-shrink-0">→</span>
                          <span className="text-[#ff6b35] font-mono">{link.effect}</span>
                          {link.evidence && <span className="text-[#2e3d54]">({link.evidence})</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Flagged Communications */}
            {effectiveCaseFile.networkAnalysis?.flaggedRelevantMessages?.length > 0 && (
              <Card>
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel color="#14b8a6">Flagged Communications</SectionLabel>
                  <span
                    className="text-[9px] font-mono px-2 py-0.5 rounded-full -mt-1"
                    style={{ color: '#14b8a6', background: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.22)' }}
                  >
                    {effectiveCaseFile.networkAnalysis!.flaggedRelevantMessages!.length}
                  </span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {effectiveCaseFile.networkAnalysis!.flaggedRelevantMessages!.map((msg) => (
                    <div key={msg.messageId} className="rounded-lg p-3" style={{ background: '#070d1a', border: '1px solid #1a2235' }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-mono">
                          <span className="text-[#14b8a6]">{msg.senderId}</span>
                          <span className="text-[#2e3d54]">→</span>
                          <span className="text-[#14b8a6]">{msg.recipientId}</span>
                        </div>
                        <span className="text-[9px] font-mono text-[#2e3d54]">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-[#9baab8] leading-relaxed">{msg.bodySnippet}</p>
                      {msg.rationale && (
                        <p className="text-[10px] text-[#374151] mt-1.5 italic border-t border-[#1a2235] pt-1.5">{msg.rationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Evidence Summary */}
            {effectiveCaseFile.evidenceSummary && (
              <Card>
                <SectionLabel color="#4b5563">Evidence Summary</SectionLabel>
                <p className="text-sm text-[#9baab8] leading-relaxed">{effectiveCaseFile.evidenceSummary}</p>
              </Card>
            )}

          </div>
        </div>

        {/* Bottom rule */}
        <div className="h-px flex-shrink-0" style={{ background: 'linear-gradient(90deg, transparent, #1a2235 50%, transparent)' }} />
      </div>
    </div>
  );
}
