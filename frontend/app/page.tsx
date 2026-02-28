'use client';

import { useState, useCallback } from 'react';
import { TopBar } from './components/TopBar';
import { AgentRegistry } from './components/LeftSidebar/AgentRegistry';
import { InvestigationRegistry } from './components/LeftSidebar/InvestigationRegistry';
import { AnalyticsSidebar } from './components/LeftSidebar/AnalyticsSidebar';
import { BehavioralGraph } from './components/CenterPanel/BehavioralGraph';
import { SpriteView } from './components/CenterPanel/SpriteView';
import { ContextPanel } from './components/RightSidebar/ContextPanel';
import { Timeline } from './components/Timeline/Timeline';
import { useAgentState } from './hooks/useAgentState';
import { useTimelineState } from './hooks/useTimelineState';
import { caseFiles } from './data/mockData';
import type { InvestigatorSelection } from './types';

export type ViewMode = 'graph' | 'sprite';
export type SidebarMode = 'agents' | 'investigations' | 'analytics' | 'settings' | null;

export default function Dashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>('graph');
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('agents');

  // Toggle sidebar: clicking the active mode hides it, clicking a different mode switches to it
  const handleSidebarModeChange = useCallback((mode: 'agents' | 'investigations' | 'analytics' | 'settings') => {
    setSidebarMode(prev => prev === mode ? null : mode);
  }, []);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [investigatorSelection, setInvestigatorSelection] = useState<InvestigatorSelection | null>(null);
  const [pendingAssignment, setPendingAssignment] = useState<{ investigatorId: string; targetAgentId: string } | null>(null);

  const {
    selectedAgentId,
    selectAgent,
    getAgentStatus,
    clearAgent,
    restrictAgent,
    suspendAgent,
    getClustersWithCurrentStatus,
  } = useAgentState();

  const {
    timeRange,
    setTimeRange,
    isLive,
    currentTime,
    startTime,
    endTime,
    visibleEvents,
    currentAgentStates,
    handleScrubberChange,
    jumpToLive,
    eventDensity,
    scrubberPosition,
    positionToTime,
  } = useTimelineState();

  // Use historical agent states when not live, otherwise use current state
  const getEffectiveAgentStatus = (agentId: string) => {
    if (!isLive && currentAgentStates[agentId]) {
      return currentAgentStates[agentId];
    }
    return getAgentStatus(agentId);
  };

  // Get clusters with effective agent status (considering timeline position)
  const clusters = getClustersWithCurrentStatus().map((cluster) => ({
    ...cluster,
    agents: cluster.agents.map((agent) => ({
      ...agent,
      status: getEffectiveAgentStatus(agent.id),
    })),
  }));

  // Handle investigator selection from graph
  const handleInvestigatorSelect = useCallback((selection: InvestigatorSelection | null) => {
    setInvestigatorSelection(selection);
  }, []);

  // Handle agent assignment from sidebar
  const handleAgentAssign = useCallback((targetAgentId: string) => {
    if (investigatorSelection) {
      setPendingAssignment({
        investigatorId: investigatorSelection.investigatorId,
        targetAgentId,
      });
    }
  }, [investigatorSelection]);

  // Clear pending assignment after it's processed
  const handleAssignmentComplete = useCallback(() => {
    setPendingAssignment(null);
    setInvestigatorSelection(null);
  }, []);

  // Cancel investigator selection
  const handleCancelInvestigatorSelection = useCallback(() => {
    setInvestigatorSelection(null);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0e1a]">
      {/* Top Bar - 48px */}
      <TopBar viewMode={viewMode} onViewModeChange={setViewMode} sidebarMode={sidebarMode} onSidebarModeChange={handleSidebarModeChange} />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - collapsible */}
        {sidebarMode && (
          <div className={sidebarMode === 'analytics' ? 'w-[22%] min-w-[320px]' : 'w-[10%] min-w-[180px]'}>
            {sidebarMode === 'agents' && (
              <AgentRegistry
                clusters={clusters}
                selectedAgentId={selectedAgentId}
                onSelectAgent={selectAgent}
                getAgentStatus={getEffectiveAgentStatus}
              />
            )}
            {sidebarMode === 'investigations' && (
              <InvestigationRegistry
                cases={caseFiles}
                selectedCaseId={selectedCaseId}
                onSelectCase={setSelectedCaseId}
              />
            )}
            {sidebarMode === 'analytics' && (
              <AnalyticsSidebar
                clusters={clusters}
                getAgentStatus={getEffectiveAgentStatus}
              />
            )}
          </div>
        )}

        {/* Center Panel - 75% */}
        <div className="flex-1 relative">
          {viewMode === 'graph' ? (
            <BehavioralGraph
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              getAgentStatus={getAgentStatus}
              historicalAgentStates={currentAgentStates}
              isLive={isLive}
              investigatorSelection={investigatorSelection}
              onInvestigatorSelect={handleInvestigatorSelect}
              pendingAssignment={pendingAssignment}
              onAssignmentComplete={handleAssignmentComplete}
              showHeatmap={sidebarMode === 'analytics'}
            />
          ) : (
            <SpriteView
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              getAgentStatus={getAgentStatus}
              historicalAgentStates={currentAgentStates}
              isLive={isLive}
              investigatorSelection={investigatorSelection}
              onInvestigatorSelect={handleInvestigatorSelect}
              pendingAssignment={pendingAssignment}
              onAssignmentComplete={handleAssignmentComplete}
            />
          )}
        </div>

        {/* Right Sidebar - 15% */}
        <div className="w-[15%] min-w-[240px]">
          <ContextPanel
            selectedAgentId={selectedAgentId}
            onClear={clearAgent}
            onRestrict={restrictAgent}
            onSuspend={suspendAgent}
            getAgentStatus={getEffectiveAgentStatus}
            visibleEvents={visibleEvents}
            isLive={isLive}
            investigatorSelection={investigatorSelection}
            onAgentAssign={handleAgentAssign}
            onCancelInvestigatorSelection={handleCancelInvestigatorSelection}
          />
        </div>
      </div>

      {/* Timeline Bar - 60px */}
      <Timeline
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        isLive={isLive}
        onJumpToLive={jumpToLive}
        scrubberPosition={scrubberPosition}
        onScrubberChange={handleScrubberChange}
        positionToTime={positionToTime}
        eventDensity={eventDensity}
        startTime={startTime}
        endTime={endTime}
      />
    </div>
  );
}
