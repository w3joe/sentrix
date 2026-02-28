'use client';

import { thoughtMessages } from '../../data/mockData';

const sourceColors: Record<string, string> = {
  'PATROL-1': 'text-[#00d4ff]',
  'PATROL-2': 'text-[#00d4ff]',
  INVESTIGATOR: 'text-[#9b59b6]',
  'FLOATER-1': 'text-[#ffaa00]',
  'FLOATER-2': 'text-[#ffaa00]',
};

export function ThoughtStream() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[#1f2937]">
        <h3 className="text-[10px] uppercase tracking-wider text-[#6b7280] font-semibold">
          Agent Thought Stream
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {thoughtMessages.map((thought) => {
          const sourceColor = sourceColors[thought.source] || 'text-[#6b7280]';
          return (
            <div key={thought.id} className="text-xs font-mono px-2 py-1">
              <span className={sourceColor}>[{thought.source}]</span>{' '}
              <span className="text-[#a0aec0]">{thought.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
