'use client';

import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { Agent, AgentStatus, Cluster } from '../../types';

interface AgentRegistryProps {
  clusters: Cluster[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  getAgentStatus: (agentId: string) => AgentStatus;
  isLoading?: boolean;
  isError?: boolean;
  useMocks?: boolean;
}

const statusColors: Record<AgentStatus, string> = {
  working:    'bg-[#00c853]',
  idle:       'bg-[#4a9eff]',
  restricted: 'bg-[#ffaa00]',
  suspended:  'bg-[#6b7280]',
};

const recordBadgeColors: Record<string, string> = {
  clear:     'bg-[#3b82f6]/20 text-[#3b82f6] border-[#3b82f6]/30',
  low_risk:  'bg-[#eab308]/20 text-[#eab308] border-[#eab308]/30',
  high_risk: 'bg-[#ff3355]/20 text-[#ff3355] border-[#ff3355]/30',
};

function getClusterStatus(agents: Agent[], getAgentStatus: (agentId: string) => AgentStatus): AgentStatus {
  const statuses = agents.map(a => getAgentStatus(a.id));
  if (statuses.includes('restricted')) return 'restricted';
  if (statuses.includes('suspended')) return 'suspended';
  if (statuses.includes('working')) return 'working';
  return 'idle';
}

export function AgentRegistry({ clusters, selectedAgentId, onSelectAgent, getAgentStatus, isLoading, isError, useMocks = false }: AgentRegistryProps) {
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(() => new Set(clusters.map(c => c.id)));

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) {
        next.delete(clusterId);
      } else {
        next.add(clusterId);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col bg-[#111827] border-r border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
          Agent Registry
        </h2>
      </div>

      {/* Cluster List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-3 py-6 text-center text-[10px] text-[#6b7280]">
            Loading agents...
          </div>
        )}
        {!isLoading && isError && (
          <div className="px-3 py-6 text-center text-[10px] text-[#ef4444]">
            Cannot connect to Bridge DB. Ensure it is running on port 3001 and the frontend proxy is configured.
          </div>
        )}
        {!isLoading && !isError && clusters.length === 0 && (
          <div className="px-3 py-6 text-center text-[10px] text-[#6b7280]">
            No agents in registry. Bridge DB is connected.
          </div>
        )}
        {!isLoading && clusters.map((cluster) => {
          const isExpanded = expandedClusters.has(cluster.id);
          const clusterStatus = getClusterStatus(cluster.agents, getAgentStatus);
          const hasSelectedAgent = cluster.agents.some(a => a.id === selectedAgentId);

          return (
            <div key={cluster.id} className="border-b border-[#1f2937]/50">
              {/* Cluster Header */}
              <button
                onClick={() => toggleCluster(cluster.id)}
                className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors hover:bg-[#1a2332] ${
                  hasSelectedAgent ? 'bg-[#1a2332]/50' : ''
                }`}
              >
                {/* Expand/Collapse Icon */}
                <svg
                  className={`w-3 h-3 text-[#6b7280] transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>

                {/* Cluster Status Dot */}
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[clusterStatus]} ${
                    clusterStatus === 'restricted' ? 'pulse-warning' : ''
                  }`}
                />

                {/* Cluster Name */}
                <span className="text-xs font-medium text-[#9ca3af] flex-1 truncate">
                  {cluster.name}
                </span>

                {/* Agent Count Badge */}
                <span className="text-[10px] px-1.5 py-0.5 bg-[#1f2937] text-[#6b7280] rounded">
                  {cluster.agents.length}
                </span>
              </button>

              {/* Agent List (Collapsible) */}
              {isExpanded && (
                <div className="pl-4">
                  {cluster.agents.map((agent) => {
                    const currentStatus = getAgentStatus(agent.id);
                    const isSelected = selectedAgentId === agent.id;

                    return (
                      <button
                        key={agent.id}
                        onClick={() => onSelectAgent(agent.id)}
                        className={`w-full px-2 py-1.5 flex items-center gap-1.5 text-left transition-colors border-l-2 ${
                          isSelected
                            ? 'bg-[#1f2937] border-l-[#00d4ff]'
                            : 'border-l-transparent hover:bg-[#1a2332]'
                        }`}
                      >
                        {/* Status Dot */}
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColors[currentStatus]} ${
                            currentStatus === 'restricted' ? 'pulse-warning' : ''
                          }`}
                        />

                        {/* Agent Info */}
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="text-xs text-[#e0e6ed] truncate">{agent.name}</div>
                          <div className="flex items-center gap-1 mt-0.5 overflow-hidden">
                            {/* Role Tag */}
                            <span className="text-[9px] px-1 py-0.5 bg-[#1f2937] text-[#6b7280] rounded font-mono truncate flex-shrink min-w-0">
                              {agent.role}
                            </span>
                            {/* Record Badge */}
                            <span
                              className={`text-[9px] px-1 py-0.5 rounded border flex-shrink-0 ${
                                recordBadgeColors[agent.record]
                              }`}
                            >
                              {agent.record}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Status Pie Chart */}
      <StatusPieChart clusters={clusters} getAgentStatus={getAgentStatus} />
    </div>
  );
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  working:    '#00c853',
  idle:       '#4a9eff',
  restricted: '#ffaa00',
  suspended:  '#6b7280',
};

const tooltipStyle = {
  contentStyle: { backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '4px', fontSize: '10px' },
  labelStyle: { color: '#e0e6ed' },
  itemStyle: { color: '#00d4ff' },
};

function StatusPieChart({ clusters, getAgentStatus }: { clusters: Cluster[]; getAgentStatus: (id: string) => AgentStatus }) {
  const allAgents = clusters.flatMap(c => c.agents);
  const counts = { working: 0, idle: 0, restricted: 0, suspended: 0 } as Record<AgentStatus, number>;
  for (const a of allAgents) counts[getAgentStatus(a.id)]++;
  const total = allAgents.length;

  const data = (Object.keys(counts) as AgentStatus[])
    .map(s => ({ name: s.charAt(0).toUpperCase() + s.slice(1), value: counts[s], color: STATUS_COLORS[s] }))
    .filter(d => d.value > 0);

  return (
    <div className="border-t border-[#1f2937] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold mb-1">Agent Status</div>
      <div className="relative h-24">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={28} outerRadius={42} paddingAngle={2} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-base font-bold text-[#e0e6ed]">{total}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-[9px] text-[#6b7280]">{d.name} {d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
