'use client';

import type { ViewMode, SidebarMode } from '../page';

interface TopBarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: NonNullable<SidebarMode>) => void;
}

export function TopBar({ viewMode, onViewModeChange, sidebarMode, onSidebarModeChange }: TopBarProps) {

  return (
    <header className="h-12 bg-[#111827] border-b border-[#1f2937] flex items-center justify-between px-6">
      {/* Left: Wordmark and Navigation */}
      <div className="flex items-center gap-8">
        <span className="text-xl font-bold text-white tracking-wide">Sentrix</span>

        {/* Navigation */}
        <nav className="hidden lg:flex items-center gap-6 ml-4">
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-md text-white hover:bg-[#1f2937] hover:text-[#00d4ff] transition-colors" title="Dashboard/Overview: Main view with the behavioral graph and timeline">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
          </a>
          <button
            onClick={() => onSidebarModeChange('agents')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              sidebarMode === 'agents'
                ? 'text-[#00d4ff] bg-[#1f2937]'
                : 'text-[#9ca3af] hover:bg-[#1f2937] hover:text-white'
            }`}
            title="Agents: Browse and manage all agents in the registry"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
          <button
            onClick={() => onSidebarModeChange('investigations')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              sidebarMode === 'investigations'
                ? 'text-[#9b59b6] bg-[#1f2937]'
                : 'text-[#9ca3af] hover:bg-[#1f2937] hover:text-white'
            }`}
            title="Cases: View case files and investigation reports"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-md text-[#9ca3af] hover:bg-[#1f2937] hover:text-white transition-colors" title="Missions/Operations: View active and past patrol missions">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          </a>
          <button
            onClick={() => onSidebarModeChange('analytics')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              sidebarMode === 'analytics'
                ? 'text-[#00d4ff] bg-[#1f2937]'
                : 'text-[#9ca3af] hover:bg-[#1f2937] hover:text-white'
            }`}
            title="Analytics: Metrics, performance data, and insights"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
          </button>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-md text-[#9ca3af] hover:bg-[#1f2937] hover:text-white transition-colors" title="Events/Logs: Centralized event monitoring and system logs">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </a>
          <button
            onClick={() => onSidebarModeChange('settings')}
            className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
              sidebarMode === 'settings'
                ? 'text-[#00d4ff] bg-[#1f2937]'
                : 'text-[#9ca3af] hover:bg-[#1f2937] hover:text-white'
            }`}
            title="Settings/Config: System configuration and preferences"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </nav>
      </div>

      {/* Right: Counters, Toggle, and Profile */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-[#6b7280] text-xs uppercase tracking-wider">Active Agents</span>
            <span className="text-[#00d4ff] font-mono font-semibold">6</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[#6b7280] text-xs uppercase tracking-wider">Incidents (24h)</span>
            <span className="text-[#ffaa00] font-mono font-semibold">3</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[#6b7280] text-xs uppercase tracking-wider">Threats Intercepted</span>
            <span className="text-[#ff3355] font-mono font-semibold">12</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-[#1f2937]" />

        {/* View Toggle - Sliding Toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#6b7280]">View:</span>
          <button
            onClick={() => onViewModeChange(viewMode === 'graph' ? 'sprite' : 'graph')}
            className="relative w-[88px] h-9 bg-[#1f2937] rounded-full border border-[#374151] hover:border-[#4b5563] transition-colors p-1"
            title={`Switch to ${viewMode === 'graph' ? 'sprite' : 'graph'} view`}
          >
            {/* Sliding background */}
            <div
              className={`absolute top-1 bottom-1 w-10 bg-[#00d4ff] rounded-full transition-all duration-300 ease-in-out ${
                viewMode === 'graph' ? 'left-1' : 'left-[calc(100%-44px)]'
              }`}
            />

            {/* Icons */}
            <div className="relative flex items-center justify-between h-full px-1">
              {/* Graph Icon */}
              <div className={`w-8 h-full flex items-center justify-center transition-colors duration-300 ${
                viewMode === 'graph' ? 'text-black' : 'text-[#6b7280]'
              }`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="6" cy="6" r="2" />
                  <circle cx="18" cy="6" r="2" />
                  <circle cx="6" cy="18" r="2" />
                  <circle cx="18" cy="18" r="2" />
                  <line x1="8" y1="6" x2="10" y2="10" strokeLinecap="round" />
                  <line x1="16" y1="6" x2="14" y2="10" strokeLinecap="round" />
                  <line x1="8" y1="18" x2="10" y2="14" strokeLinecap="round" />
                  <line x1="16" y1="18" x2="14" y2="14" strokeLinecap="round" />
                </svg>
              </div>

              {/* Sprite Icon */}
              <div className={`w-8 h-full flex items-center justify-center transition-colors duration-300 ${
                viewMode === 'sprite' ? 'text-black' : 'text-[#6b7280]'
              }`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Profile Icon */}
        <button
          className="w-9 h-9 rounded-full bg-gradient-to-br from-[#00d4ff] to-[#0099cc] flex items-center justify-center hover:scale-105 transition-transform"
          title="Profile"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-white">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}
