'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { agents as mockAgents, violationCounts as mockViolationCounts } from '../../data/mockData';
import { useAgentViolationCounts } from '../../hooks/api/useBridgeQueries';
import type { Cluster } from '../../types';

const getBarColor = (violations: number) => {
  if (violations >= 3) return '#ff3355';
  if (violations >= 1) return '#ffaa00';
  return '#00d4ff';
};

interface ViolationChartProps {
  clusters?: Cluster[];
  useMocks?: boolean;
}

export function ViolationChart({ clusters = [], useMocks = false }: ViolationChartProps) {
  const agentIds = useMemo(
    () => clusters.flatMap((c) => c.agents.map((a) => a.id)),
    [clusters]
  );
  const { data: violationCountsMap = {} } = useAgentViolationCounts(useMocks ? [] : agentIds);

  const chartData = useMemo(() => {
    if (useMocks) {
      return mockAgents.map((agent, index) => ({
        name: agent.name.split('-')[0],
        fullName: agent.name,
        violations: mockViolationCounts[index],
      }));
    }
    return clusters.flatMap((c) =>
      c.agents.map((agent) => ({
        name: agent.name.split('-')[0],
        fullName: agent.name,
        violations: violationCountsMap[agent.id] ?? 0,
      }))
    );
  }, [useMocks, clusters, violationCountsMap]);

  return (
    <div className="p-3 border-t border-[#1f2937]">
      <div className="text-[10px] uppercase tracking-wider text-[#6b7280] mb-2">
        Violations (24h)
      </div>
      <div className="h-20">
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 8, fill: '#6b7280' }}
              axisLine={{ stroke: '#1f2937' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 8, fill: '#6b7280' }}
              axisLine={{ stroke: '#1f2937' }}
              tickLine={false}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '4px',
                fontSize: '10px',
              }}
              labelStyle={{ color: '#e0e6ed' }}
              itemStyle={{ color: '#00d4ff' }}
              formatter={(value) => [value, 'Violations']}
              labelFormatter={() => ''}
            />
            <Bar dataKey="violations" radius={[2, 2, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.violations)} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
