'use client';

import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis,
  AreaChart, Area,
} from 'recharts';
import { agents, violationCounts, timelineEvents, caseFiles } from '../../data/mockData';
import type { Cluster, AgentStatus } from '../../types';

// ── Shared constants ─────────────────────────────────────────────────────────

const COLORS = {
  working: '#00c853',
  idle: '#4a9eff',
  restricted: '#ffaa00',
  suspended: '#6b7280',
  cyan: '#00d4ff',
  falsePositive: '#00c853',
  inconclusive: '#ffaa00',
  confirmed: '#ff3355',
  // Incident severity colors (Incident.severity is separate from AgentStatus)
  warning: '#ffaa00',
  critical: '#ff3355',
};

const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#111827',
    border: '1px solid #1f2937',
    borderRadius: '4px',
    fontSize: '10px',
  },
  labelStyle: { color: '#e0e6ed' },
  itemStyle: { color: '#00d4ff' },
};

// ── Props ────────────────────────────────────────────────────────────────────

interface AnalyticsSidebarProps {
  clusters: Cluster[];
  getAgentStatus: (agentId: string) => AgentStatus;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AnalyticsSidebar({ clusters, getAgentStatus }: AnalyticsSidebarProps) {
  return (
    <div className="h-full flex flex-col bg-[#111827] border-r border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">
          Analytics
        </h2>
      </div>

      {/* Scrollable chart list */}
      <div className="flex-1 overflow-y-auto">
        <AgentStatusDonut clusters={clusters} getAgentStatus={getAgentStatus} />
        <ViolationsBar />
        <IncidentTimeline />
        <CrimeTypeBreakdown />
        <InvestigationOutcomes />
        <AgentRiskHeatmap clusters={clusters} getAgentStatus={getAgentStatus} />
      </div>
    </div>
  );
}

// ── Chart 1: Agent Status Distribution (Donut) ──────────────────────────────

function AgentStatusDonut({ clusters, getAgentStatus }: { clusters: Cluster[]; getAgentStatus: (id: string) => AgentStatus }) {
  const allAgents = clusters.flatMap(c => c.agents);
  const counts = { working: 0, idle: 0, restricted: 0, suspended: 0 };
  for (const a of allAgents) {
    const s = getAgentStatus(a.id);
    counts[s]++;
  }
  const total = allAgents.length;

  const data = [
    { name: 'Working', value: counts.working, color: COLORS.working },
    { name: 'Idle', value: counts.idle, color: COLORS.idle },
    { name: 'Restricted', value: counts.restricted, color: COLORS.restricted },
    { name: 'Suspended', value: counts.suspended, color: COLORS.suspended },
  ].filter(d => d.value > 0);

  return (
    <ChartSection title="Agent Status">
      <div className="relative h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={2} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-[#e0e6ed]">{total}</span>
        </div>
      </div>
      <Legend items={data} />
    </ChartSection>
  );
}

// ── Chart 2: Violations by Agent (Bar) ───────────────────────────────────────

function ViolationsBar() {
  const chartData = agents.map((agent, i) => ({
    name: agent.id.replace('c', '').replace('-', ''),
    violations: violationCounts[i],
  }));

  const getBarColor = (v: number) => {
    if (v >= 3) return COLORS.restricted;
    if (v >= 1) return COLORS.restricted;
    return COLORS.cyan;
  };

  return (
    <ChartSection title="Violations (24h)">
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 7, fill: '#6b7280' }} axisLine={{ stroke: '#1f2937' }} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={{ stroke: '#1f2937' }} tickLine={false} domain={[0, 'auto']} />
            <Tooltip {...tooltipStyle} formatter={(value) => [value, 'Violations']} labelFormatter={() => ''} />
            <Bar dataKey="violations" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={getBarColor(entry.violations)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

// ── Chart 3: Incident Timeline (Stacked Area) ───────────────────────────────

function IncidentTimeline() {
  // Bucket incidents into 4h windows across 24h
  const incidents = timelineEvents.filter(e => e.type === 'incident');
  const now = new Date();
  const buckets: { label: string; critical: number; warning: number; clear: number }[] = [];

  for (let i = 5; i >= 0; i--) {
    const bucketStart = new Date(now.getTime() - (i + 1) * 4 * 60 * 60 * 1000);
    const bucketEnd = new Date(now.getTime() - i * 4 * 60 * 60 * 1000);
    const label = `${24 - (i + 1) * 4}h`;
    const bucket = { label, critical: 0, warning: 0, clear: 0 };
    for (const inc of incidents) {
      if (inc.timestamp >= bucketStart && inc.timestamp < bucketEnd) {
        const sev = inc.severity as 'critical' | 'warning' | 'clear';
        bucket[sev]++;
      }
    }
    buckets.push(bucket);
  }

  return (
    <ChartSection title="Incidents (24h)">
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={buckets} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={{ stroke: '#1f2937' }} tickLine={false} />
            <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={{ stroke: '#1f2937' }} tickLine={false} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Area type="monotone" dataKey="clear" stackId="1" stroke={COLORS.cyan} fill={COLORS.cyan} fillOpacity={0.3} />
            <Area type="monotone" dataKey="warning" stackId="1" stroke={COLORS.warning} fill={COLORS.warning} fillOpacity={0.4} />
            <Area type="monotone" dataKey="critical" stackId="1" stroke={COLORS.critical} fill={COLORS.critical} fillOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

// ── Chart 4: Crime Type Breakdown (Horizontal Bar) ───────────────────────────

function CrimeTypeBreakdown() {
  const crimeMap: Record<string, number> = {};
  for (const c of caseFiles) {
    const crime = c.investigatorReport.crimeClassification;
    const label = crime.replace(/_/g, ' ');
    crimeMap[label] = (crimeMap[label] || 0) + 1;
  }
  const data = Object.entries(crimeMap).map(([name, count]) => ({ name, count }));

  return (
    <ChartSection title="Crime Types">
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
            <XAxis type="number" tick={{ fontSize: 8, fill: '#6b7280' }} axisLine={{ stroke: '#1f2937' }} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 8, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={90} />
            <Tooltip {...tooltipStyle} formatter={(value) => [value, 'Cases']} labelFormatter={() => ''} />
            <Bar dataKey="count" fill={COLORS.cyan} fillOpacity={0.7} radius={[0, 3, 3, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartSection>
  );
}

// ── Chart 5: Investigation Outcomes (Donut) ──────────────────────────────────

function InvestigationOutcomes() {
  const verdictCounts: Record<string, number> = {};
  for (const c of caseFiles) {
    verdictCounts[c.verdict] = (verdictCounts[c.verdict] || 0) + 1;
  }

  const verdictColors: Record<string, string> = {
    confirmed_violation: COLORS.confirmed,
    false_positive: COLORS.falsePositive,
    inconclusive: COLORS.inconclusive,
  };

  const verdictLabels: Record<string, string> = {
    confirmed_violation: 'Confirmed',
    false_positive: 'False Positive',
    inconclusive: 'Inconclusive',
  };

  const data = Object.entries(verdictCounts).map(([verdict, count]) => ({
    name: verdictLabels[verdict] || verdict,
    value: count,
    color: verdictColors[verdict] || COLORS.cyan,
  }));

  const total = caseFiles.length;

  return (
    <ChartSection title="Investigation Outcomes">
      <div className="relative h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={45} paddingAngle={2} dataKey="value" strokeWidth={0}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-lg font-bold text-[#e0e6ed]">{total}</span>
        </div>
      </div>
      <Legend items={data} />
    </ChartSection>
  );
}

// ── Chart 6: Agent Risk Heatmap (Grid) ───────────────────────────────────────

const ROLES = ['EMAIL_AGENT', 'CODING_AGENT', 'DOCUMENT_AGENT', 'DATA_QUERY_AGENT'];
const ROLE_SHORT = ['Email', 'Code', 'Doc', 'Data'];

const heatmapGradients: Record<AgentStatus, string> = {
  working:    'radial-gradient(ellipse at center, rgba(0,200,83,0.9) 0%, rgba(0,200,83,0.3) 60%, transparent 100%)',
  idle:       'radial-gradient(ellipse at center, rgba(74,158,255,0.7) 0%, rgba(74,158,255,0.2) 60%, transparent 100%)',
  restricted: 'radial-gradient(ellipse at center, rgba(255,170,0,1) 0%, rgba(255,170,0,0.4) 60%, transparent 100%)',
  suspended:  'radial-gradient(ellipse at center, rgba(107,114,128,0.8) 0%, rgba(107,114,128,0.2) 60%, transparent 100%)',
};

function AgentRiskHeatmap({ clusters, getAgentStatus }: { clusters: Cluster[]; getAgentStatus: (id: string) => AgentStatus }) {
  return (
    <ChartSection title="Risk Heatmap">
      {/* Column headers */}
      <div className="grid grid-cols-[40px_repeat(4,1fr)] gap-1 mb-1">
        <div />
        {ROLE_SHORT.map(r => (
          <div key={r} className="text-[8px] text-[#6b7280] text-center truncate">{r}</div>
        ))}
      </div>

      {/* Rows */}
      {clusters.map((cluster, ci) => (
        <div key={cluster.id} className="grid grid-cols-[40px_repeat(4,1fr)] gap-1 mb-1">
          <div className="text-[8px] text-[#6b7280] flex items-center">C{ci + 1}</div>
          {ROLES.map(role => {
            const agent = cluster.agents.find(a => a.role === role);
            const status = agent ? getAgentStatus(agent.id) : 'idle';
            return (
              <div
                key={role}
                className="h-5 rounded-sm transition-all"
                style={{ background: heatmapGradients[status] }}
                title={agent ? `${agent.name}: ${status}` : ''}
              />
            );
          })}
        </div>
      ))}
    </ChartSection>
  );
}

// ── Shared helpers ───────────────────────────────────────────────────────────

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-3 border-b border-[#1f2937]">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7280] mb-2 font-semibold">{title}</div>
      {children}
    </div>
  );
}

function Legend({ items }: { items: { name: string; value: number; color: string }[] }) {
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
      {items.map(item => (
        <div key={item.name} className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
          <span className="text-[9px] text-[#6b7280]">{item.name} ({item.value})</span>
        </div>
      ))}
    </div>
  );
}
