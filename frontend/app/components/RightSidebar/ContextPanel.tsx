'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Agent, AgentStatus, TimelineEvent, PatrolSelection } from '../../types';
import type { PatrolResponseState } from '../../hooks/usePatrolResponseSequence';
import { investigatorReport, damageAssessment, agents as mockAgents, agentActivities } from '../../data/mockData';
import {
  useAgentActions,
  useAgentCommunications,
  useAgentNetwork,
  useMessages,
  useInvestigations,
  useCaseFiles,
} from '../../hooks/api/useBridgeQueries';
import { useSwarmStatus, useFlags } from '../../hooks/api/usePatrolQueries';

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
  responseState?: PatrolResponseState;
}

// System entity IDs
const INVESTIGATOR_IDS = new Set(['f1', 'f2', 'investigator-1', 'investigator-2']);
const NETWORK_IDS = new Set(['network']);
const SUPERINTENDENT_IDS = new Set(['superintendent', 'inv']);
const PATROL_IDS = new Set(['p1', 'p2']);

function isInvestigator(id: string) { return INVESTIGATOR_IDS.has(id); }
function isNetwork(id: string) { return NETWORK_IDS.has(id); }
function isSuperintendent(id: string) { return SUPERINTENDENT_IDS.has(id); }
function isPatrol(id: string) { return PATROL_IDS.has(id); }

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

function SectionCard({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
      <h3 className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-[10px] text-[#4b5563]">{label}</p>;
}

// ─── Patrol Panel ──────────────────────────────────────────────────────────────
function PatrolPanel({
  patrolId,
  responseState,
}: {
  patrolId: string;
  responseState?: PatrolResponseState;
}) {
  const { data: swarmStatus } = useSwarmStatus();
  const { data: flags = [] } = useFlags();

  const label = patrolId === 'p1' ? 'Patrol-1' : 'Patrol-2';

  const isActive = responseState && responseState.patrolId === patrolId && responseState.phase !== 'idle';
  const phase = isActive ? responseState!.phase : null;
  const flaggedAgent = isActive ? responseState!.flaggedAgentId : null;

  const phaseLabel: Record<string, string> = {
    patrol_moving: 'Moving to target',
    summoning: 'Summoning team',
    at_scene: 'At scene',
    returning: 'Returning',
    reporting: 'Reporting',
  };
  const phaseColors: Record<string, string> = {
    patrol_moving: '#ffaa00',
    summoning: '#9b59b6',
    at_scene: '#ff3355',
    returning: '#00d4ff',
    reporting: '#00c853',
  };

  const recentFlags = flags.slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#00d4ff] uppercase tracking-wider font-mono">{label}</span>
        {isActive && phase ? (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{ color: phaseColors[phase] ?? '#6b7280', backgroundColor: (phaseColors[phase] ?? '#6b7280') + '20' }}
          >
            {phaseLabel[phase] ?? phase}
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono text-[#00c853] bg-[#00c85320]">
            On patrol
          </span>
        )}
      </div>

      <SectionCard title="Current Mission" color="#00d4ff">
        {isActive && flaggedAgent ? (
          <div className="space-y-1 text-[10px]">
            <div>
              <span className="text-[#6b7280]">Target: </span>
              <span className="text-[#a0aec0] font-mono">{flaggedAgent}</span>
            </div>
            <div>
              <span className="text-[#6b7280]">Phase: </span>
              <span style={{ color: phaseColors[phase!] ?? '#a0aec0' }}>{phaseLabel[phase!] ?? phase}</span>
            </div>
          </div>
        ) : (
          <EmptyState label="No active mission — patrolling" />
        )}
      </SectionCard>

      {swarmStatus && (
        <SectionCard title="Swarm Status" color="#00d4ff">
          <div className="space-y-1 text-[10px]">
            {Object.entries(swarmStatus).slice(0, 6).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-[#6b7280] truncate">{k}</span>
                <span className="text-[#a0aec0] font-mono ml-2 flex-shrink-0">{String(v)}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent Flags" color="#ffaa00">
        {recentFlags.length === 0 ? (
          <EmptyState label="No recent flags" />
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto font-mono">
            {recentFlags.map((flag: any, i: number) => (
              <div key={flag.flagId ?? i} className="text-[10px] border-b border-[#1f2937] pb-1 last:border-0">
                <div className="flex justify-between">
                  <span className="text-[#ffaa00] truncate">{flag.targetAgentId ?? '—'}</span>
                  <span className="text-[#4b5563] ml-2 flex-shrink-0">{flag.severity ?? ''}</span>
                </div>
                {flag.timestamp && (
                  <div className="text-[#4b5563]">{String(flag.timestamp).slice(0, 16)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Investigator Panel ────────────────────────────────────────────────────────
function InvestigatorPanel({
  investigatorId,
  responseState,
}: {
  investigatorId: string;
  responseState?: PatrolResponseState;
}) {
  const { data: communications = [] } = useAgentCommunications(investigatorId);
  const { data: investigations = [] } = useInvestigations();

  const label = investigatorId === 'f1' ? 'Investigator-1' : 'Investigator-2';

  // Active investigation: the most recent open/in_progress one (or from responseState)
  const activeInv = useMemo(() => {
    const live = investigations.find(
      (i) => i.status === 'open' || i.status === 'in_progress',
    );
    return live ?? null;
  }, [investigations]);

  // If this investigator (f1) is the one in a response sequence, show that context
  const isActive = investigatorId === 'f1' && responseState && responseState.phase !== 'idle';
  const phase = isActive ? responseState!.phase : null;
  const flaggedAgent = isActive ? responseState!.flaggedAgentId : null;

  const phaseLabel: Record<string, string> = {
    patrol_moving: 'Patrol dispatched',
    summoning: 'Summoning team',
    at_scene: 'At scene',
    returning: 'Returning',
    reporting: 'Reporting',
  };

  const phaseColors: Record<string, string> = {
    patrol_moving: '#ffaa00',
    summoning: '#9b59b6',
    at_scene: '#ff3355',
    returning: '#00d4ff',
    reporting: '#00c853',
  };

  return (
    <div className="space-y-3">
      {/* Header badge */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#9b59b6] uppercase tracking-wider font-mono">{label}</span>
        {isActive && phase ? (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-mono"
            style={{ color: phaseColors[phase] ?? '#6b7280', backgroundColor: (phaseColors[phase] ?? '#6b7280') + '20' }}
          >
            {phaseLabel[phase] ?? phase}
          </span>
        ) : (
          <span className="text-[9px] px-1.5 py-0.5 rounded font-mono text-[#00c853] bg-[#00c85320]">
            Standby
          </span>
        )}
      </div>

      {/* Active investigation */}
      <SectionCard title="Active Investigation" color="#9b59b6">
        {isActive && flaggedAgent ? (
          <div className="space-y-1 text-[10px]">
            <div>
              <span className="text-[#6b7280]">Target: </span>
              <span className="text-[#a0aec0] font-mono">{flaggedAgent}</span>
            </div>
            <div>
              <span className="text-[#6b7280]">Phase: </span>
              <span style={{ color: phaseColors[phase!] ?? '#a0aec0' }}>{phaseLabel[phase!] ?? phase}</span>
            </div>
          </div>
        ) : activeInv ? (
          <div className="space-y-1 text-[10px]">
            <div>
              <span className="text-[#6b7280]">Target: </span>
              <span className="text-[#a0aec0] font-mono">{activeInv.targetAgentId ?? '—'}</span>
            </div>
            <div>
              <span className="text-[#6b7280]">Status: </span>
              <span className="text-[#ffaa00]">{activeInv.status}</span>
            </div>
            {activeInv.openedAt && (
              <div>
                <span className="text-[#6b7280]">Opened: </span>
                <span className="text-[#4b5563] font-mono">{String(activeInv.openedAt).slice(0, 16)}</span>
              </div>
            )}
          </div>
        ) : (
          <EmptyState label="No active investigation" />
        )}
      </SectionCard>

      {/* Location/movement */}
      <SectionCard title="Location" color="#00d4ff">
        {isActive && phase ? (
          <p className="text-[10px] text-[#a0aec0]">
            {phase === 'at_scene' || phase === 'summoning'
              ? `At target: ${flaggedAgent}`
              : phase === 'returning' || phase === 'reporting'
              ? 'Returning to control room'
              : 'Moving to target'}
          </p>
        ) : (
          <p className="text-[10px] text-[#a0aec0]">Control room — on standby</p>
        )}
      </SectionCard>

      {/* Communications */}
      <SectionCard title="Comms Log" color="#14b8a6">
        {communications.length === 0 ? (
          <EmptyState label="No recent communications" />
        ) : (
          <div className="space-y-1.5 max-h-36 overflow-y-auto font-mono">
            {communications.slice(0, 8).map((msg) => (
              <div key={msg.messageId} className="text-[10px]">
                <span className="text-[#14b8a6]">{msg.senderId} → {msg.recipientId}</span>
                <span className="text-[#4b5563] ml-1">{msg.timestamp}</span>
                <div className="text-[#6b7280] truncate mt-0.5">{msg.body}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Network Panel ─────────────────────────────────────────────────────────────
function NetworkPanel() {
  const { data: messages = [] } = useMessages();
  const { data: investigations = [] } = useInvestigations();

  const stats = useMemo(() => {
    const pairs = new Set(messages.map((m) => `${m.senderId}→${m.recipientId}`));
    const flaggedCount = investigations.filter(
      (i) => i.status === 'concluded' || i.status === 'in_progress',
    ).length;

    const senderCount: Record<string, number> = {};
    for (const m of messages) {
      senderCount[m.senderId] = (senderCount[m.senderId] ?? 0) + 1;
    }
    const topSenders = Object.entries(senderCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return { total: messages.length, pairs: pairs.size, flaggedCount, topSenders };
  }, [messages, investigations]);

  const recent = messages.slice(0, 15);

  return (
    <div className="space-y-3">
      <span className="text-[10px] text-[#7c3aed] uppercase tracking-wider font-mono">Network Agent</span>

      {/* Traffic summary */}
      <SectionCard title="Traffic Summary" color="#7c3aed">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-sm font-mono font-bold text-[#a0aec0]">{stats.total}</div>
            <div className="text-[9px] text-[#4b5563]">messages</div>
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#ffaa00]">{stats.flaggedCount}</div>
            <div className="text-[9px] text-[#4b5563]">flagged</div>
          </div>
          <div>
            <div className="text-sm font-mono font-bold text-[#00d4ff]">{stats.pairs}</div>
            <div className="text-[9px] text-[#4b5563]">pairs</div>
          </div>
        </div>
      </SectionCard>

      {/* Top senders */}
      <SectionCard title="Top Senders" color="#7c3aed">
        {stats.topSenders.length === 0 ? (
          <EmptyState label="No data" />
        ) : (
          <div className="space-y-1">
            {stats.topSenders.map(([id, count]) => (
              <div key={id} className="flex items-center justify-between text-[10px]">
                <span className="text-[#a0aec0] font-mono truncate">{id}</span>
                <span className="text-[#7c3aed] font-mono ml-2">{count}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Recent A2A feed */}
      <SectionCard title="Recent A2A Feed" color="#14b8a6">
        {recent.length === 0 ? (
          <EmptyState label="No messages" />
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono">
            {recent.map((msg) => (
              <div key={msg.messageId} className="text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="text-[#14b8a6] truncate">{msg.senderId}</span>
                  <span className="text-[#4b5563]">→</span>
                  <span className="text-[#14b8a6] truncate">{msg.recipientId}</span>
                </div>
                <div className="text-[#6b7280] truncate">{msg.body}</div>
                <div className="text-[#4b5563]">{msg.timestamp}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Superintendent Panel ──────────────────────────────────────────────────────
function SuperintendentPanel({ responseState }: { responseState?: PatrolResponseState }) {
  const { data: caseFiles = [] } = useCaseFiles();

  const recentVerdicts = useMemo(
    () =>
      [...caseFiles]
        .filter((c) => c.concludedAt)
        .sort((a, b) => {
          const ta = a.concludedAt ? new Date(a.concludedAt).getTime() : 0;
          const tb = b.concludedAt ? new Date(b.concludedAt).getTime() : 0;
          return tb - ta;
        })
        .slice(0, 5),
    [caseFiles],
  );

  const verdictColor = (v: string) => {
    if (v === 'guilty') return '#ff3355';
    if (v === 'innocent') return '#00c853';
    return '#6b7280';
  };

  const phaseLabel: Record<string, string> = {
    idle: 'Idle',
    patrol_moving: 'Moving',
    summoning: 'Summoning',
    at_scene: 'At scene',
    returning: 'Returning',
    reporting: 'Reporting',
  };

  const phase = responseState?.phase ?? 'idle';
  const activePatrol = responseState?.patrolId;

  const p1Phase = activePatrol === 'p1' ? phase : 'idle';
  const p2Phase = activePatrol === 'p2' ? phase : 'idle';

  const phaseColor = (p: string) =>
    p === 'idle' ? '#4b5563' : p === 'at_scene' ? '#ff3355' : '#ffaa00';

  return (
    <div className="space-y-3">
      <span className="text-[10px] text-[#a855f7] uppercase tracking-wider font-mono">Superintendent</span>

      {/* Patrol status */}
      <SectionCard title="Patrol Status" color="#a855f7">
        <div className="space-y-2">
          {(['p1', 'p2'] as const).map((pid) => {
            const p = pid === 'p1' ? p1Phase : p2Phase;
            return (
              <div key={pid} className="flex items-center justify-between text-[10px]">
                <span className="text-[#a0aec0] font-mono">
                  {pid === 'p1' ? 'Patrol-1' : 'Patrol-2'}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded font-mono"
                  style={{ color: phaseColor(p), backgroundColor: phaseColor(p) + '20' }}
                >
                  {phaseLabel[p] ?? p}
                </span>
              </div>
            );
          })}
          {activePatrol && phase !== 'idle' && responseState?.flaggedAgentId && (
            <div className="text-[10px] pt-1 border-t border-[#1f2937]">
              <span className="text-[#6b7280]">Target: </span>
              <span className="text-[#a0aec0] font-mono">{responseState.flaggedAgentId}</span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Recent verdicts */}
      <SectionCard title="Recent Verdicts" color="#a855f7">
        {recentVerdicts.length === 0 ? (
          <EmptyState label="No concluded investigations" />
        ) : (
          <div className="space-y-2">
            {recentVerdicts.map((c) => (
              <div key={c.investigationId} className="text-[10px] border-b border-[#1f2937] pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="text-[#a0aec0] font-mono truncate">{c.targetAgentId}</span>
                  <span
                    className="px-1.5 py-0.5 rounded font-mono ml-2 flex-shrink-0"
                    style={{ color: verdictColor(c.verdict ?? ''), backgroundColor: verdictColor(c.verdict ?? '') + '20' }}
                  >
                    {c.verdict ?? '—'}
                  </span>
                </div>
                {c.severityScore != null && (
                  <div className="text-[#6b7280] mt-0.5">
                    Severity: <span className="text-[#ffaa00]">{c.severityScore}</span>
                  </div>
                )}
                {c.concludedAt && (
                  <div className="text-[#4b5563] font-mono mt-0.5">{String(c.concludedAt).slice(0, 16)}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main ContextPanel ─────────────────────────────────────────────────────────
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
  responseState,
}: ContextPanelProps) {
  const [isClient, setIsClient] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

  const agents = useMocks ? mockAgents : (agentsProp ?? []);
  const isSystemEntity = selectedAgentId
    ? isInvestigator(selectedAgentId) || isNetwork(selectedAgentId) || isSuperintendent(selectedAgentId) || isPatrol(selectedAgentId)
    : false;

  const { data: agentActions = [] } = useAgentActions(
    selectedAgentId && !isSystemEntity ? selectedAgentId : null,
  );
  const { data: communications = [] } = useAgentCommunications(
    selectedAgentId && !isSystemEntity ? selectedAgentId : null,
  );
  const { data: networkData } = useAgentNetwork(
    selectedAgentId && !isSystemEntity ? selectedAgentId : null,
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setExpandedAgentId(null);
  }, [patrolSelection]);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const currentStatus = selectedAgentId ? getAgentStatus(selectedAgentId) : null;
  const activity = useMocks && selectedAgentId ? agentActivities[selectedAgentId] : null;

  const sortedEvents = [...visibleEvents].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
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

  const statusColors = {
    working:    { bg: '#003a1a', border: '#00c853', text: '#00c853' },
    idle:       { bg: '#1e3a5f', border: '#4a9eff', text: '#4a9eff' },
    restricted: { bg: '#3a2a00', border: '#ffaa00', text: '#ffaa00' },
    suspended:  { bg: '#1f2937', border: '#6b7280', text: '#6b7280' },
  };

  // Determine panel title
  const panelTitle = selectedAgentId
    ? isPatrol(selectedAgentId)
      ? selectedAgentId === 'p1' ? 'Patrol-1' : 'Patrol-2'
      : isInvestigator(selectedAgentId)
      ? selectedAgentId === 'f1' ? 'Investigator-1' : 'Investigator-2'
      : isNetwork(selectedAgentId)
      ? 'Network Agent'
      : isSuperintendent(selectedAgentId)
      ? 'Superintendent'
      : patrolSelection
      ? 'Select Agent to Investigate'
      : selectedAgent?.name ?? selectedAgentId
    : 'Context';

  return (
    <div className="h-full flex flex-col bg-[#111827] border-l border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
          {panelTitle}
        </h2>
        {patrolSelection && (
          <span className="text-[10px] text-[#00d4ff]">{patrolSelection.patrolLabel}</span>
        )}
        {!patrolSelection && !selectedAgent && !isLive && !isSystemEntity && (
          <span className="text-[10px] text-[#ffaa00]">Historical View</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* System entity panels */}
        {selectedAgentId && isPatrol(selectedAgentId) ? (
          <PatrolPanel patrolId={selectedAgentId} responseState={responseState} />
        ) : selectedAgentId && isInvestigator(selectedAgentId) ? (
          <InvestigatorPanel investigatorId={selectedAgentId} responseState={responseState} />
        ) : selectedAgentId && isNetwork(selectedAgentId) ? (
          <NetworkPanel />
        ) : selectedAgentId && isSuperintendent(selectedAgentId) ? (
          <SuperintendentPanel responseState={responseState} />
        ) : selectedAgentId && !patrolSelection ? (
          <>
            {/* Current Activity (mock) */}
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

            {/* Recent Actions (API) */}
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

            {/* Investigator Report — mock only */}
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
        ) : patrolSelection ? (
          /* Patrol Agent Selection Mode */
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

                    {isExpanded && (
                      <div className="px-2.5 pb-2.5 space-y-2 border-t border-[#1f2937]">
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
                            <div className="space-y-0.5 font-mono max-h-20 overflow-y-auto">
                              {agentActivity.logs.slice(-3).map((log) => (
                                <div key={log.id} className="flex items-start gap-1 text-[9px]">
                                  <span className="flex-shrink-0" style={{ color: logTypeColors[log.type] }}>
                                    {logTypePrefixes[log.type]}
                                  </span>
                                  <span className="text-[#4b5563] flex-shrink-0">{log.timestamp}</span>
                                  <span className="truncate" style={{ color: logTypeColors[log.type] }}>
                                    {log.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="pt-1">
                          <span className="text-[10px] text-[#6b7280]">Record: </span>
                          <span
                            className="text-[10px]"
                            style={{
                              color: agent.record === 'high_risk'
                                ? '#ff3355'
                                : agent.record === 'low_risk'
                                  ? '#eab308'
                                  : '#3b82f6',
                            }}
                          >
                            {agent.record}
                          </span>
                        </div>
                        <button
                          onClick={() => onAgentAssign?.(agent.id)}
                          className="w-full py-1.5 rounded text-xs font-semibold transition-all mt-2"
                          style={{ backgroundColor: colors.text, color: '#000' }}
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
        ) : null}
      </div>
    </div>
  );
}
