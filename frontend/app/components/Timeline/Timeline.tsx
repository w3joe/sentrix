'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { TimeRange } from '../../types';

interface EventDensityBucket {
  minute: number;
  count: number;
  maxSeverity: 'critical' | 'warning' | 'clear' | null;
}

interface TimelineProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  isLive: boolean;
  onJumpToLive: () => void;
  scrubberPosition: number;
  onScrubberChange: (time: Date) => void;
  positionToTime: (percentage: number) => Date;
  eventDensity: EventDensityBucket[];
  startTime: Date;
  endTime: Date;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '1h', label: 'Last 1 Hour' },
  { value: '6h', label: 'Last 6 Hours' },
  { value: '24h', label: 'Last 24 Hours' },
];

const SEVERITY_COLORS = {
  critical: '#ff3355',
  warning: '#ffaa00',
  clear: '#00c853',
};

export function Timeline({
  timeRange,
  onTimeRangeChange,
  isLive,
  onJumpToLive,
  scrubberPosition,
  onScrubberChange,
  positionToTime,
  eventDensity,
  startTime,
  endTime,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [localPosition, setLocalPosition] = useState(scrubberPosition);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTime, setCurrentTime] = useState<string>('');

  // Update current time every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync local position with prop when not dragging
  useEffect(() => {
    if (!isDragging) {
      setLocalPosition(scrubberPosition);
    }
  }, [scrubberPosition, isDragging]);

  // Handle mouse/touch position calculation
  const getPositionFromEvent = useCallback((clientX: number): number => {
    if (!trackRef.current) return 0;
    const rect = trackRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    return Math.max(0, Math.min(100, percentage));
  }, []);

  // Debounced update to parent
  const debouncedUpdate = useCallback((position: number) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      const time = positionToTime(position);
      onScrubberChange(time);
    }, 150);
  }, [positionToTime, onScrubberChange]);

  // Handle scrubber drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    const position = getPositionFromEvent(e.clientX);
    setLocalPosition(position);
    debouncedUpdate(position);
  }, [getPositionFromEvent, debouncedUpdate]);

  // Handle mouse move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const position = getPositionFromEvent(e.clientX);
      setLocalPosition(position);
      debouncedUpdate(position);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, getPositionFromEvent, debouncedUpdate]);

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);

  // Format time for display
  const formatTime = (date: Date): string => {
    if (!isMounted) return '--:--';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  };

  // Get max count for normalization
  const maxCount = Math.max(...eventDensity.map((b) => b.count), 1);

  return (
    <div className="h-[60px] bg-[#111827] border-t border-[#1f2937] flex items-center px-4 gap-4">
      {/* Time Range Dropdown */}
      <div className="relative">
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
          className="appearance-none bg-[#1f2937] text-[#a0aec0] text-xs px-3 py-1.5 pr-8 rounded border border-[#374151] cursor-pointer hover:border-[#4b5563] focus:outline-none focus:border-[#00d4ff]"
        >
          {TIME_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Start Time */}
      <span className="text-[10px] text-[#6b7280] font-mono w-12">{formatTime(startTime)}</span>

      {/* Timeline Track with Heatmap */}
      <div
        ref={trackRef}
        className="flex-1 h-6 relative cursor-pointer select-none"
        onMouseDown={handleMouseDown}
      >
        {/* Heatmap Background */}
        <div className="absolute inset-0 flex gap-px">
          {eventDensity.map((bucket, index) => {
            const intensity = bucket.count / maxCount;
            const color = bucket.maxSeverity ? SEVERITY_COLORS[bucket.maxSeverity] : '#1f2937';
            const opacity = bucket.count > 0 ? 0.3 + intensity * 0.7 : 0.1;

            return (
              <div
                key={index}
                className="flex-1 rounded-sm"
                style={{
                  backgroundColor: color,
                  opacity: opacity,
                }}
              />
            );
          })}
        </div>

        {/* Track Line */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-[#1f2937] rounded-full -translate-y-1/2" />

        {/* Progress Fill */}
        <div
          className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-[#00d4ff]/30 to-[#00d4ff]/70 rounded-full -translate-y-1/2 transition-all"
          style={{ width: `${localPosition}%` }}
        />

        {/* Scrubber Handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-all ${
            isDragging
              ? 'bg-[#00d4ff] border-[#00d4ff] scale-125'
              : isLive
              ? 'bg-[#00c853] border-[#00c853]'
              : 'bg-[#00d4ff] border-[#00d4ff]'
          }`}
          style={{ left: `${localPosition}%` }}
        />

        {/* Time Labels on Track */}
        <div className="absolute -bottom-0.5 left-0 right-0 flex justify-between pointer-events-none">
          {[0, 25, 50, 75, 100].map((pct) => (
            <div
              key={pct}
              className="text-[8px] text-[#4b5563] font-mono"
              style={{ transform: pct === 0 ? 'none' : pct === 100 ? 'translateX(-100%)' : 'translateX(-50%)' }}
            >
              |
            </div>
          ))}
        </div>
      </div>

      {/* End Time */}
      <span className="text-[10px] text-[#6b7280] font-mono w-12 text-right">{formatTime(endTime)}</span>

      {/* Jump to Live Button */}
      <button
        onClick={onJumpToLive}
        disabled={isLive}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
          isLive
            ? 'bg-[#00c853]/20 text-[#00c853] cursor-not-allowed'
            : 'bg-[#00c853] text-black hover:bg-[#00c853]/80'
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isLive ? 'bg-[#00c853] animate-pulse' : 'bg-black'
          }`}
        />
        LIVE
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-[#1f2937]" />

      {/* Live Clock */}
      <div className="font-mono text-[#e0e6ed] text-sm min-w-[70px]">
        {currentTime}
      </div>
    </div>
  );
}
