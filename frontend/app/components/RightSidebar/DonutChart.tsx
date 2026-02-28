'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

interface DonutChartProps {
  clean: number;
  warning: number;
  critical: number;
}

const COLORS = {
  clean: '#00c853',
  warning: '#ffaa00',
  critical: '#ff3355',
};

export function DonutChart({ clean, warning, critical }: DonutChartProps) {
  const data = [
    { name: 'Clean', value: clean, color: COLORS.clean },
    { name: 'Warning', value: warning, color: COLORS.warning },
    { name: 'Critical', value: critical, color: COLORS.critical },
  ].filter((item) => item.value > 0);

  const total = clean + warning + critical;

  const renderLegend = () => (
    <div className="flex justify-center gap-4 mt-2">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.clean }} />
        <span className="text-[10px] text-[#6b7280]">Clean ({clean})</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.warning }} />
        <span className="text-[10px] text-[#6b7280]">Warning ({warning})</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS.critical }} />
        <span className="text-[10px] text-[#6b7280]">Critical ({critical})</span>
      </div>
    </div>
  );

  return (
    <div className="bg-[#0a0e1a] rounded-lg p-3 border border-[#1f2937]">
      <h3 className="text-xs uppercase tracking-wider text-[#6b7280] mb-3 font-semibold">
        Agent Status Distribution
      </h3>
      <div className="relative h-28">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={35}
              outerRadius={50}
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-[#e0e6ed]">{total}</span>
        </div>
      </div>
      {renderLegend()}
    </div>
  );
}
