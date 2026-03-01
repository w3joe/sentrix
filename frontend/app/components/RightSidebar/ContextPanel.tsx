'use client';

import { useState, useEffect } from 'react';
import type { Agent, AgentStatus, TimelineEvent, PatrolSelection } from '../../types';
import { investigatorReport, damageAssessment, agents as mockAgents, agentActivities } from '../../data/mockData';
import { useInvestigationDetail } from '../../hooks/api/useInvestigationQueries';
import { useAgentActions } from '../../hooks/api/useBridgeQueries';

interface ContextPanelProps {
  selectedAgentId: string | null;
  selectedCaseId?: string | null;
  agents?: Agent[];
  onClear: (agentId: string) => void;
  onRestrict: (agentId: string) => void;
  onSuspend: (agentId: string) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  visibleEvents?: TimelineEvent[];
  isLive?: boolean;
  patrolSelection?: PatrolSelection | null;
  onAgentAssign?: (targetAgentId: string) => void;
  onCancelPatrolSelection?: () => void;
  useMocks?: boolean;
}

const severityIcons: Record<string, string> = {
  critical: '🔴',
  warning: '🟡',
  clear: '🟢',
};

const sourceColors: Record<string, string> = {
  'PATROL-1': '#00d4ff',
  'PATROL-2': '#00d4ff',
  'INVESTIGATOR': '#9b59b6',
  'SUPERINTENDENT': '#a855f7',
  'NETWORK': '#14b8a6',
  'FLOATER-2': '#ffaa00',
};

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function ContextPanel({
  selectedAgentId,
  selectedCaseId = null,
  agents: agentsProp,
  onClear,
  onRestrict,
  onSuspend,
  getAgentStatus,
  visibleEvents = [],
  isLive = true,
  patrolSelection,
  onAgentAssign,
  onCancelPatrolSelection,
  useMocks = false,
}: ContextPanelProps) {
  const [isClient, setIsClient] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  // Use agents from database (agentsProp) when available, otherwise fall back to mock agents
  const agents = useMocks ? mockAgents : (agentsProp ?? []);
  const { data: investigationDetail } = useInvestigationDetail(selectedCaseId);
  const { data: agentActions = [] } = useAgentActions(selectedAgentId);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Reset expanded agent when patrol selection changes
  useEffect(() => {
    setExpandedAgentId(null);
  }, [patrolSelection]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const currentStatus = selectedAgentId ? getAgentStatus(selectedAgentId) : null;
  const activity = useMocks && selectedAgentId ? agentActivities[selectedAgentId] : null;
  const caseFile = selectedCaseId ? investigationDetail?.caseFile : null;

  // Sort events by timestamp descending for display
  const sortedEvents = [...visibleEvents].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  const logTypeColors: Record<string, string> = {
    tool_call: '#00d4ff',
    step: '#a0aec0',
    output: '#6b7280',
    error: '#ff3355',
  };

  const logTypePrefixes: Record<string, string> = {
    tool_call: '▶',
    step: '·',
    output: '◀',
    error: '✕',
  };

  const activityStatusColors: Record<string, string> = {
    running: '#00c853',
    blocked: '#ff3355',
    idle: '#6b7280',
  };

  // Status colors for agent selection
  const statusColors = {
    working:    { bg: '#003a1a', border: '#00c853', text: '#00c853' },
    idle:       { bg: '#1e3a5f', border: '#4a9eff', text: '#4a9eff' },
    restricted: { bg: '#3a2a00', border: '#ffaa00', text: '#ffaa00' },
    suspended:  { bg: '#1f2937', border: '#6b7280', text: '#6b7280' },
  };

  return (
    <div className="h-full flex flex-col bg-[#111827] border-l border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
          {patrolSelection
            ? 'Select Agent to Investigate'
            : selectedCaseId
              ? `Case: ${selectedCaseId}`
              : selectedAgent
                ? selectedAgent.name
                : 'Event Log'}
        </h2>
        {patrolSelection && (
          <span className="text-[10px] text-[#00d4ff]">{patrolSelection.patrolLabel}</span>
        )}
        {!patrolSelection && !selectedAgent && !isLive && (
          <span className="text-[10px] text-[#ffaa00]">Historical View</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Patrol Agent Selection Mode */}
        {patrolSelection ? (
          <div className="space-y-3">
            <p className="text-xs text-[#a0aec0]">
              Select an agent for {patrolSelection.patrolLabel} to investigate:
            </p>
            <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {agents.map((agent) => {
                const status = getAgentStatus(agent.id);
                const colors = statusColors[status as keyof typeof statusColors] || statusColors.idle;
                const isExpanded = expandedAgentId === agent.id;
                const agentActivity = agentActivities[agent.id];

                return (
                  <div
                    key={agent.id}
                    className="rounded border transition-all"
                    style={{
                      backgroundColor: colors.bg,
                      borderColor: isExpanded ? colors.text : colors.border,
                      borderWidth: isExpanded ? '2px' : '1px',
                    }}
                  >
                    {/* Collapsed header - always visible */}
                    <button
                      onClick={() => setExpandedAgentId(isExpanded ? null : agent.id)}
                      className="w-full p-2.5 text-left hover:brightness-110 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-white block truncate">{agent.name}</span>
                          <span className="text-[10px] text-[#6b7280]">{agent.role}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                            style={{
                              color: colors.text,
                              backgroundColor: `${colors.border}20`,
                              border: `1px solid ${colors.border}`,
                            }}
                          >
                            {status}
                          </span>
                          <span className="text-[#6b7280] text-xs">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-[#1f2937]">
                        {/* Current Activity */}
                        {agentActivity && (
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] uppercase tracking-wider text-[#6b7280]">
                                Current Activity
                              </span>
                              <span
                                className="text-[9px] font-mono px-1 py-0.5 rounded"
                                style={{
                                  color: activityStatusColors[agentActivity.status],
                                  backgroundColor: activityStatusColors[agentActivity.status] + '20',
                                }}
                              >
                                {agentActivity.status.toUpperCase()}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#a0aec0] mb-2">{agentActivity.currentTask}</p>

                            {/* Recent logs */}
                            <div className="space-y-0.5 font-mono max-h-20 overflow-y-auto">
                              {agentActivity.logs.slice(-3).map((log) => (
                                <div key={log.id} className="flex items-start gap-1 text-[9px]">
                                  <span
                                    className="flex-shrink-0"
                                    style={{ color: logTypeColors[log.type] }}
                                  >
                                    {logTypePrefixes[log.type]}
                                  </span>
                                  <span className="text-[#4b5563] flex-shrink-0">{log.timestamp}</span>
                                  <span
                                    className="truncate"
                                    style={{ color: logTypeColors[log.type] }}
                                  >
                                    {log.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Agent Record */}
                        <div className="pt-1">
                          <span className="text-[10px] text-[#6b7280]">Record: </span>
                          <span
                            className="text-[10px]"
                            style={{
                              color: agent.record === 'high_risk'
                                ? '#ff3355'
                                : agent.record === 'low_risk'
                                  ? '#ffaa00'
                                  : '#00c853'
                            }}
                          >
                            {agent.record}
                          </span>
                        </div>

                        {/* Assign Button */}
                        <button
                          onClick={() => onAgentAssign?.(agent.id)}
                          className="w-full py-1.5 rounded text-xs font-semibold transition-all mt-2"
                          style={{
                            backgroundColor: colors.text,
                            color: '#000',
                          }}
                        >
                          Assign {patrolSelection.patrolLabel}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : selectedCaseId && caseFile ? (
          <>
            {/* Case File from Investigation API - Enhanced Detail View */}
            <div className="space-y-4">
              {/* Executive Summary */}
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-[#e0e6ed] font-semibold">
                    Case Summary
                  </h3>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${
                      caseFile.status === 'concluded'
                        ? 'text-[#6b7280] border-[#6b7280]/30 bg-[#6b7280]/10'
                        : caseFile.status === 'in_progress'
                          ? 'text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/10'
                          : 'text-[#ffaa00] border-[#ffaa00]/30 bg-[#ffaa00]/10'
                    }`}
                  >
                    {caseFile.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs">
                    <span className="text-[#6b7280]">Target: </span>
                    <span className="text-[#00d4ff] font-mono">{caseFile.targetAgentId}</span>
                  </div>
                  <div className="text-xs">
                    <span className="text-[#6b7280]">Classification: </span>
                    <span className="text-[#ff6b35] font-mono">
                      {caseFile.crimeClassification.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-[#a0aec0] leading-relaxed">{caseFile.summary}</p>
                </div>
              </div>

              {/* Key Findings */}
              {caseFile.keyFindings && caseFile.keyFindings.length > 0 && (
                <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                  <h3 className="text-xs uppercase tracking-wider text-[#00d4ff] mb-2 font-semibold">
                    Key Findings
                  </h3>
                  <ul className="space-y-1.5">
                    {caseFile.keyFindings.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-[11px] text-[#a0aec0]">
                        <span className="text-[#00d4ff] mt-0.5">•</span>
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Investigator Report */}
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#9b59b6] mb-2 font-semibold">
                  Investigator Report
                </h3>
                <div className="space-y-2 text-[11px] text-[#a0aec0]">
                  <p className="leading-relaxed">
                    {caseFile.investigatorReport?.caseFacts ?? '—'}
                  </p>
                  {caseFile.investigatorReport?.relevantLogIds && caseFile.investigatorReport.relevantLogIds.length > 0 && (
                    <div className="pt-1 border-t border-[#1f2937]">
                      <span className="text-[10px] text-[#6b7280]">Related Logs: </span>
                      <span className="text-[10px] font-mono text-[#9b59b6]">
                        {caseFile.investigatorReport.relevantLogIds.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Network Analysis */}
              {caseFile.networkAnalysis?.flaggedRelevantMessages && caseFile.networkAnalysis.flaggedRelevantMessages.length > 0 && (
                <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                  <h3 className="text-xs uppercase tracking-wider text-[#14b8a6] mb-2 font-semibold">
                    Flagged Communications ({caseFile.networkAnalysis.flaggedRelevantMessages.length})
                  </h3>
                  <div className="space-y-2 max-h-36 overflow-y-auto">
                    {caseFile.networkAnalysis.flaggedRelevantMessages.map((msg) => (
                      <div
                        key={msg.messageId}
                        className="bg-[#111827] rounded p-2 border border-[#1f2937]"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] font-mono text-[#14b8a6]">
                            {msg.senderId} → {msg.recipientId}
                          </span>
                          <span className="text-[9px] text-[#6b7280]">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#a0aec0] truncate">{msg.bodySnippet}</p>
                        {msg.rationale && (
                          <p className="text-[9px] text-[#6b7280] mt-1 italic">{msg.rationale}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Damage Report */}
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#ffaa00] mb-2 font-semibold">
                  Damage Assessment
                </h3>
                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[#6b7280]">Severity:</span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold ${
                        caseFile.damageReport?.damageSeverity === 'critical'
                          ? 'text-[#ff3355] bg-[#ff3355]/10'
                          : caseFile.damageReport?.damageSeverity === 'high'
                            ? 'text-[#ff6b35] bg-[#ff6b35]/10'
                            : caseFile.damageReport?.damageSeverity === 'medium'
                              ? 'text-[#ffaa00] bg-[#ffaa00]/10'
                              : 'text-[#00c853] bg-[#00c853]/10'
                      }`}
                    >
                      {caseFile.damageReport?.damageSeverity?.toUpperCase() ?? 'NONE'}
                    </span>
                    <span className="text-[#6b7280]">|</span>
                    <span className="text-[#6b7280]">Propagation:</span>
                    <span className="text-[#a0aec0]">{caseFile.damageReport?.propagationRisk ?? '—'}</span>
                  </div>
                  <p className="text-[#a0aec0] leading-relaxed">
                    {caseFile.damageReport?.estimatedImpact ?? '—'}
                  </p>
                  {caseFile.damageReport?.dataExposureScope && (
                    <div className="pt-1">
                      <span className="text-[#6b7280]">Exposure Scope: </span>
                      <span className="text-[#ffaa00] font-mono text-[10px]">
                        {caseFile.damageReport.dataExposureScope}
                      </span>
                    </div>
                  )}
                  {caseFile.damageReport?.affectedAgents && caseFile.damageReport.affectedAgents.length > 0 && (
                    <div>
                      <span className="text-[#6b7280]">Affected Agents: </span>
                      <span className="text-[#a0aec0] font-mono text-[10px]">
                        {caseFile.damageReport.affectedAgents.join(', ')}
                      </span>
                    </div>
                  )}
                  {/* Causal Chain */}
                  {caseFile.damageReport?.causalChain && caseFile.damageReport.causalChain.length > 0 && (
                    <div className="pt-2 border-t border-[#1f2937]">
                      <span className="text-[10px] text-[#6b7280] uppercase tracking-wider">Causal Chain</span>
                      <div className="mt-1 space-y-1">
                        {caseFile.damageReport.causalChain.map((link, idx) => (
                          <div key={idx} className="flex items-center gap-1 text-[10px]">
                            <span className="text-[#ffaa00]">{link.cause}</span>
                            <span className="text-[#6b7280]">→</span>
                            <span className="text-[#ff6b35]">{link.effect}</span>
                            {link.evidence && (
                              <span className="text-[#6b7280] ml-1">({link.evidence})</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Verdict */}
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#e0e6ed] mb-2 font-semibold">
                  Verdict
                </h3>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-sm font-bold px-2 py-1 rounded ${
                      caseFile.verdict === 'guilty'
                        ? 'text-[#ff3355] bg-[#ff3355]/10 border border-[#ff3355]/30'
                        : caseFile.verdict === 'not_guilty'
                          ? 'text-[#00c853] bg-[#00c853]/10 border border-[#00c853]/30'
                          : 'text-[#ffaa00] bg-[#ffaa00]/10 border border-[#ffaa00]/30'
                    }`}
                  >
                    {caseFile.verdict === 'guilty'
                      ? 'GUILTY'
                      : caseFile.verdict === 'not_guilty'
                        ? 'NOT GUILTY'
                        : 'UNDER WATCH'}
                  </span>
                  <div className="flex-1 text-right">
                    <div className="text-[11px]">
                      <span className="text-[#6b7280]">Severity Score: </span>
                      <span className="text-[#00d4ff] font-bold text-sm">{caseFile.severityScore}/10</span>
                    </div>
                    <div className="text-[10px]">
                      <span className="text-[#6b7280]">Confidence: </span>
                      <span className="text-[#a0aec0]">{(caseFile.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
                {caseFile.concludedAt && (
                  <div className="mt-2 pt-2 border-t border-[#1f2937] text-[10px] text-[#6b7280]">
                    Concluded: {new Date(caseFile.concludedAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Evidence Summary */}
              {caseFile.evidenceSummary && (
                <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                  <h3 className="text-xs uppercase tracking-wider text-[#6b7280] mb-2 font-semibold">
                    Evidence Summary
                  </h3>
                  <p className="text-[11px] text-[#a0aec0] leading-relaxed">
                    {caseFile.evidenceSummary}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : selectedCaseId && !caseFile ? (
          <div className="text-xs text-[#6b7280] py-8 text-center">
            Loading investigation...
          </div>
        ) : selectedAgent && selectedAgentId ? (
          <>
            {/* Current Activity (mock) or Action Log (API) */}
            {activity && (
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-[#00d4ff] font-semibold">
                    Current Activity
                  </h3>
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      color: activityStatusColors[activity.status],
                      backgroundColor: activityStatusColors[activity.status] + '20',
                    }}
                  >
                    {activity.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-[#a0aec0] mb-3">{activity.currentTask}</p>
                <div className="space-y-1 font-mono">
                  {activity.logs.map((log) => (
                    <div key={log.id} className="flex items-start gap-1.5 text-[10px]">
                      <span className="flex-shrink-0 mt-px" style={{ color: logTypeColors[log.type] }}>
                        {logTypePrefixes[log.type]}
                      </span>
                      <span className="text-[#4b5563] flex-shrink-0">{log.timestamp}</span>
                      <span style={{ color: logTypeColors[log.type] }}>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!useMocks && agentActions.length > 0 && (
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#00d4ff] font-semibold mb-2">
                  Recent Actions
                </h3>
                <div className="space-y-1 font-mono">
                  {agentActions.slice(0, 10).map((act) => (
                    <div key={act.actionId} className="text-[10px]">
                      <span className="text-[#4b5563]">{act.timestamp}</span>
                      <span className={act.violation ? ' text-[#ff3355]' : ' text-[#a0aec0]'}>
                        {' '}{act.actionType}
                        {act.violation && ' (violation)'}
                      </span>
                      {act.outputSummary && (
                        <div className="text-[#6b7280] truncate ml-4">{act.outputSummary}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Investigator Report — mock only, for critical agents */}
            {useMocks && selectedAgent?.status === 'restricted' && (
              <>
                <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                  <h3 className="text-xs uppercase tracking-wider text-[#9b59b6] mb-2 font-semibold">
                    Investigator Report
                  </h3>
                  <div className="space-y-2 text-xs text-[#a0aec0]">
                    <div>
                      <span className="text-[#6b7280]">Classification: </span>
                      {investigatorReport.crimeClassification.replace(/_/g, ' ')}
                    </div>
                    <div>
                      <span className="text-[#6b7280]">Case Facts: </span>
                      {investigatorReport.caseFacts}
                    </div>
                    {investigatorReport.relevantLogIds.length > 0 && (
                      <div>
                        <span className="text-[#6b7280]">Related Logs: </span>
                        <span className="text-[#9b59b6] font-mono text-[10px]">
                          {investigatorReport.relevantLogIds.join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                  <h3 className="text-xs uppercase tracking-wider text-[#ffaa00] mb-2 font-semibold">
                    Damage Assessment
                  </h3>
                  <div className="space-y-2 text-xs text-[#a0aec0]">
                    <div>{damageAssessment.scanResult}</div>
                    <div>
                      <span className="text-[#6b7280]">Propagation: </span>
                      {damageAssessment.propagation}
                    </div>
                    <div>
                      <span className="text-[#6b7280]">External Exposure: </span>
                      <span className="text-[#ffaa00]">{damageAssessment.externalExposure}</span>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Recent Events for this agent */}
            {sortedEvents.filter((e) => e.agentId === selectedAgentId).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
                  Recent Events
                </h3>
                {sortedEvents
                  .filter((e) => e.agentId === selectedAgentId)
                  .slice(0, 8)
                  .map((event) => (
                    <div
                      key={event.id}
                      className={`bg-[#0a0e1a] rounded-lg p-2.5 border border-[#1f2937] ${
                        event.type === 'incident' ? 'border-l-2' : ''
                      }`}
                      style={{
                        borderLeftColor:
                          event.type === 'incident' && event.severity
                            ? event.severity === 'critical'
                              ? '#ff3355'
                              : event.severity === 'warning'
                              ? '#ffaa00'
                              : '#00c853'
                            : undefined,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {event.type === 'incident' && event.severity && (
                          <span className="text-sm flex-shrink-0">{severityIcons[event.severity]}</span>
                        )}
                        {event.type === 'thought' && (
                          <span
                            className="text-sm flex-shrink-0"
                            style={{ color: sourceColors[event.source || ''] || '#6b7280' }}
                          >
                            ◆
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-[#a0aec0]">{event.message}</div>
                          {isClient && (
                            <div className="text-[10px] text-[#6b7280] mt-1 font-mono">
                              {formatTimestamp(event.timestamp)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onClear(selectedAgentId)}
                disabled={currentStatus === 'idle'}
                className={`w-full py-2 rounded text-sm font-semibold transition-all ${
                  currentStatus === 'idle'
                    ? 'bg-[#4a9eff]/20 text-[#4a9eff] cursor-not-allowed'
                    : 'bg-[#4a9eff] text-black hover:bg-[#4a9eff]/80'
                }`}
              >
                Clear
              </button>
              <button
                onClick={() => onRestrict(selectedAgentId)}
                disabled={currentStatus === 'restricted'}
                className={`w-full py-2 rounded text-sm font-semibold transition-all ${
                  currentStatus === 'restricted'
                    ? 'bg-[#ffaa00]/20 text-[#ffaa00] cursor-not-allowed'
                    : 'bg-[#ffaa00] text-black hover:bg-[#ffaa00]/80'
                }`}
              >
                Restrict
              </button>
              <button
                onClick={() => onSuspend(selectedAgentId)}
                disabled={currentStatus === 'suspended'}
                className={`w-full py-2 rounded text-sm font-semibold transition-all ${
                  currentStatus === 'suspended'
                    ? 'bg-[#ff3355]/20 text-[#ff3355] cursor-not-allowed'
                    : 'bg-[#ff3355] text-white hover:bg-[#ff3355]/80'
                }`}
              >
                Suspend
              </button>
            </div>
          </>
        ) : (
          // No agent selected - show event log
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
                All Events
              </h3>
              <span className="text-[10px] text-[#4b5563]">
                {sortedEvents.length} events
              </span>
            </div>
            {sortedEvents.length === 0 ? (
              <div className="text-xs text-[#4b5563] text-center py-4">
                No events in this time range
              </div>
            ) : (
              sortedEvents.slice(0, 20).map((event) => (
                <div
                  key={event.id}
                  className={`bg-[#0a0e1a] rounded-lg p-2.5 border border-[#1f2937] ${
                    event.type === 'incident' ? 'border-l-2' : ''
                  }`}
                  style={{
                    borderLeftColor:
                      event.type === 'incident' && event.severity
                        ? event.severity === 'critical'
                          ? '#ff3355'
                          : event.severity === 'warning'
                          ? '#ffaa00'
                          : '#00c853'
                        : undefined,
                  }}
                >
                  <div className="flex items-start gap-2">
                    {event.type === 'incident' && event.severity && (
                      <span className="text-sm flex-shrink-0">{severityIcons[event.severity]}</span>
                    )}
                    {event.type === 'thought' && (
                      <span
                        className="text-sm flex-shrink-0"
                        style={{ color: sourceColors[event.source || ''] || '#6b7280' }}
                      >
                        ◆
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      {event.type === 'incident' && event.agentName && (
                        <div className="text-xs text-[#00d4ff] font-mono truncate">
                          {event.agentName}
                        </div>
                      )}
                      {event.type === 'thought' && event.source && (
                        <div
                          className="text-xs font-mono truncate"
                          style={{ color: sourceColors[event.source] || '#6b7280' }}
                        >
                          {event.source}
                        </div>
                      )}
                      <div className="text-xs text-[#a0aec0] mt-0.5">{event.message}</div>
                      {isClient && (
                        <div className="text-[10px] text-[#6b7280] mt-1 font-mono">
                          {formatTimestamp(event.timestamp)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
