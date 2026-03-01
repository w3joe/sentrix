'use client';

import { useEffect, useRef } from 'react';
import type { PatrolNotification } from '../hooks/usePatrolFlagNotifications';

const AUTO_DISMISS_MS = 6000;

const severityConfig = {
  critical: {
    border: 'border-[#ff3355]',
    text: 'text-[#ff3355]',
    bg: 'bg-[#ff3355]/10',
    label: 'HIGH',
    icon: '⚠',
  },
  warning: {
    border: 'border-[#ffaa00]',
    text: 'text-[#ffaa00]',
    bg: 'bg-[#ffaa00]/10',
    label: 'MEDIUM',
    icon: '⚡',
  },
  clear: {
    border: 'border-[#00c853]',
    text: 'text-[#00c853]',
    bg: 'bg-[#00c853]/10',
    label: 'LOW',
    icon: '●',
  },
};

interface PatrolAlertBannerProps {
  notification: PatrolNotification;
  onDismiss: () => void;
  onAgentClick: (agentId: string) => void;
}

export function PatrolAlertBanner({ notification, onDismiss, onAgentClick }: PatrolAlertBannerProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfg = severityConfig[notification.severity];

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification.id, onDismiss]);

  const handleAgentClick = () => {
    onAgentClick(notification.agentId);
    onDismiss();
  };

  return (
    <div
      className={`
        absolute top-0 left-0 right-0 z-50
        flex items-center gap-3 px-4 py-2.5
        border-b ${cfg.border} ${cfg.bg}
        font-mono text-xs
        animate-slide-down
      `}
    >
      {/* Icon + severity */}
      <span className={`${cfg.text} font-bold text-sm shrink-0`}>{cfg.icon}</span>
      <span className={`${cfg.text} font-bold uppercase tracking-wider shrink-0`}>
        {cfg.label}
      </span>

      {/* Divider */}
      <span className="text-[#374151] shrink-0">|</span>

      {/* Patrol label */}
      <span className="text-[#6b7280] shrink-0">Patrol detected threat on</span>

      {/* Agent — clickable */}
      <button
        onClick={handleAgentClick}
        className={`${cfg.text} font-semibold hover:underline shrink-0`}
      >
        {notification.agentName}
      </button>

      {/* Divider */}
      <span className="text-[#374151] shrink-0">—</span>

      {/* Message */}
      <span className="text-[#a0aec0] truncate">{notification.message}</span>

      {/* Timestamp */}
      <span className="text-[#4b5563] shrink-0 ml-auto">{notification.timestamp}</span>

      {/* Dismiss */}
      <button
        onClick={onDismiss}
        className="text-[#4b5563] hover:text-[#9ca3af] shrink-0 ml-2 leading-none"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
