'use client';

import { useState, useEffect } from 'react';
import type { Agent, AgentStatus, TimelineEvent, PatrolSelection } from '../../types';
import { investigatorReport, damageAssessment, agents as mockAgents, agentActivities } from '../../data/mockData';
import { useAgentActions, useAgentCommunications, useAgentNetwork } from '../../hooks/api/useBridgeQueries';

interface ContextPanelProps {
  selectedAgentId: string | null;
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
  const { data: agentActions = [] } = useAgentActions(selectedAgentId);
  const { data: communications = [] } = useAgentCommunications(selectedAgentId);
  const { data: networkData } = useAgentNetwork(selectedAgentId);

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

            {/* A2A Communications */}
            {!useMocks && communications.length > 0 && (
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#14b8a6] font-semibold mb-2">
                  A2A Communications
                </h3>
                <div className="space-y-1.5 font-mono max-h-32 overflow-y-auto">
                  {communications.slice(0, 8).map((msg) => (
                    <div key={msg.messageId} className="text-[10px]">
                      <span className="text-[#14b8a6]">{msg.senderId} → {msg.recipientId}</span>
                      <span className="text-[#4b5563] ml-1">{msg.timestamp}</span>
                      <div className="text-[#6b7280] truncate mt-0.5">{msg.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Network Summary */}
            {!useMocks && networkData && (
              <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
                <h3 className="text-xs uppercase tracking-wider text-[#9b59b6] font-semibold mb-2">
                  Network
                </h3>
                {networkData.narration && (
                  <p className="text-[10px] text-[#a0aec0] mb-2">{networkData.narration}</p>
                )}
                {networkData.interaction_partners && networkData.interaction_partners.length > 0 && (
                  <div className="text-[10px]">
                    <span className="text-[#6b7280]">Partners: </span>
                    <span className="text-[#9b59b6] font-mono">{networkData.interaction_partners.join(', ')}</span>
                  </div>
                )}
                {networkData.recent_communications && networkData.recent_communications.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                    {networkData.recent_communications.slice(0, 5).map((c: { from: string; to: string; timestamp: string; body_preview: string }, i: number) => (
                      <div key={i} className="text-[9px] text-[#6b7280]">
                        {c.from} → {c.to}: {c.body_preview}
                      </div>
                    ))}
                  </div>
                )}
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
