'use client';

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ToggleProps {
  value: boolean;
  onChange: (v: boolean) => void;
}

interface SelectProps {
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-2 border-b border-[#1f2937]">
      <span className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold">{title}</span>
    </div>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 flex items-center justify-between gap-3 border-b border-[#1f2937]/50 hover:bg-[#1a2332]/30 transition-colors">
      <div className="min-w-0">
        <div className="text-xs text-[#e0e6ed]">{label}</div>
        {description && <div className="text-[10px] text-[#6b7280] mt-0.5 leading-snug">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${value ? 'bg-[#00d4ff]' : 'bg-[#374151]'}`}
    >
      <div
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function Select({ value, options, onChange }: SelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-[#1f2937] border border-[#374151] text-[#e0e6ed] text-xs rounded px-2 py-1 outline-none focus:border-[#00d4ff] transition-colors cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsSidebar() {
  // Detection
  const [autoFlag, setAutoFlag] = useState(true);
  const [liveAlerts, setLiveAlerts] = useState(true);
  const [heatmapOverlay, setHeatmapOverlay] = useState(false);
  const [sensitivityLevel, setSensitivityLevel] = useState('medium');

  // Investigation
  const [autoAssign, setAutoAssign] = useState(false);
  const [requireConfirmSuspend, setRequireConfirmSuspend] = useState(true);
  const [retentionDays, setRetentionDays] = useState('30');

  // Display
  const [defaultView, setDefaultView] = useState('graph');
  const [defaultTimeRange, setDefaultTimeRange] = useState('24h');
  const [animateEdges, setAnimateEdges] = useState(true);
  const [compactSidebar, setCompactSidebar] = useState(false);

  // Patrol
  const [patrolInterval, setPatrolInterval] = useState('5m');
  const [autoRestart, setAutoRestart] = useState(true);

  return (
    <div className="h-full flex flex-col bg-[#111827] border-r border-[#1f2937]">
      {/* Title */}
      <div className="px-3 py-3 border-b border-[#1f2937]">
        <h2 className="text-xs uppercase tracking-wider text-[#6b7280] font-semibold">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── Detection ── */}
        <SectionHeader title="Detection" />
        <SettingRow label="Auto-flag violations" description="Automatically flag agents that breach policy thresholds">
          <Toggle value={autoFlag} onChange={setAutoFlag} />
        </SettingRow>
        <SettingRow label="Live alerts" description="Show real-time incident notifications">
          <Toggle value={liveAlerts} onChange={setLiveAlerts} />
        </SettingRow>
        <SettingRow label="Sensitivity" description="Threshold for triggering warnings">
          <Select
            value={sensitivityLevel}
            onChange={setSensitivityLevel}
            options={[
              { label: 'Low', value: 'low' },
              { label: 'Medium', value: 'medium' },
              { label: 'High', value: 'high' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Heatmap overlay" description="Show risk heatmap on graph by default">
          <Toggle value={heatmapOverlay} onChange={setHeatmapOverlay} />
        </SettingRow>

        {/* ── Investigation ── */}
        <SectionHeader title="Investigation" />
        <SettingRow label="Auto-assign investigator" description="Assign an available investigator on new critical flags">
          <Toggle value={autoAssign} onChange={setAutoAssign} />
        </SettingRow>
        <SettingRow label="Confirm before suspend" description="Require manual confirmation before suspending an agent">
          <Toggle value={requireConfirmSuspend} onChange={setRequireConfirmSuspend} />
        </SettingRow>
        <SettingRow label="Case retention" description="How long to keep closed case files">
          <Select
            value={retentionDays}
            onChange={setRetentionDays}
            options={[
              { label: '7 days', value: '7' },
              { label: '30 days', value: '30' },
              { label: '90 days', value: '90' },
              { label: 'Forever', value: 'forever' },
            ]}
          />
        </SettingRow>

        {/* ── Display ── */}
        <SectionHeader title="Display" />
        <SettingRow label="Default view" description="Starting view when the dashboard loads">
          <Select
            value={defaultView}
            onChange={setDefaultView}
            options={[
              { label: 'Graph', value: 'graph' },
              { label: 'Sprite', value: 'sprite' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Default time range" description="Timeline range shown on load">
          <Select
            value={defaultTimeRange}
            onChange={setDefaultTimeRange}
            options={[
              { label: '1 hour', value: '1h' },
              { label: '6 hours', value: '6h' },
              { label: '24 hours', value: '24h' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Animate edges" description="Show animated edges on the behavioral graph">
          <Toggle value={animateEdges} onChange={setAnimateEdges} />
        </SettingRow>
        <SettingRow label="Compact sidebar" description="Reduce padding in agent and investigation lists">
          <Toggle value={compactSidebar} onChange={setCompactSidebar} />
        </SettingRow>

        {/* ── Patrol ── */}
        <SectionHeader title="Patrol" />
        <SettingRow label="Patrol interval" description="How often patrol agents sweep the network">
          <Select
            value={patrolInterval}
            onChange={setPatrolInterval}
            options={[
              { label: '1 min', value: '1m' },
              { label: '5 min', value: '5m' },
              { label: '15 min', value: '15m' },
              { label: '30 min', value: '30m' },
            ]}
          />
        </SettingRow>
        <SettingRow label="Auto-restart patrol" description="Restart failed patrol agents automatically">
          <Toggle value={autoRestart} onChange={setAutoRestart} />
        </SettingRow>

        {/* ── System ── */}
        <SectionHeader title="System" />
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-[#6b7280]">Version</span>
            <span className="text-[#9ca3af] font-mono">0.4.2</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#6b7280]">Bridge DB</span>
            <span className="text-[#00c853] font-mono">Connected</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-[#6b7280]">Last sync</span>
            <span className="text-[#9ca3af] font-mono">just now</span>
          </div>
        </div>
        <div className="px-3 pb-3">
          <button className="w-full py-1.5 text-[10px] text-[#ff3355] border border-[#ff3355]/30 rounded hover:bg-[#ff3355]/10 transition-colors">
            Reset to defaults
          </button>
        </div>

      </div>
    </div>
  );
}
