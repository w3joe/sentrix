'use client';

import { useState, useCallback, useMemo } from 'react';
import { TopBar } from './components/TopBar';
import { AgentRegistry } from './components/LeftSidebar/AgentRegistry';
import { InvestigationRegistry } from './components/LeftSidebar/InvestigationRegistry';
import { AnalyticsSidebar } from './components/LeftSidebar/AnalyticsSidebar';
import { BehavioralGraph } from './components/CenterPanel/BehavioralGraph';
import { SpriteView } from './components/CenterPanel/SpriteView';
import { ContextPanel } from './components/RightSidebar/ContextPanel';
import { CaseFileModal } from './components/CaseFileModal';
import { PatrolAlertBanner } from './components/PatrolAlertBanner';
import { Timeline } from './components/Timeline/Timeline';
import { BottomStrip } from './components/BottomStrip/BottomStrip';
import { useAgentState } from './hooks/useAgentState';
import { useTimelineState } from './hooks/useTimelineState';
import { useCaseFiles } from './hooks/api/useBridgeQueries';
import { usePatrolFlagNotifications } from './hooks/usePatrolFlagNotifications';
import { usePatrolResponseSequence } from './hooks/usePatrolResponseSequence';
import { getAgentDeskPosition } from './components/CenterPanel/SpriteView/config/roomLayout';
import { useStartInvestigation } from './hooks/api/useInvestigationQueries';
import { caseFiles as mockCaseFiles } from './data/mockData';
import type { PatrolSelection } from './types';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

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
  const [patrolSelection, setPatrolSelection] = useState<PatrolSelection | null>(null);
  const { data: caseFiles = [], isLoading: casesLoading } = useCaseFiles();
  const { notification, dismiss, testNotify } = usePatrolFlagNotifications();
  // Dev helper — call window.__testPatrolAlert() in the browser console
  if (typeof window !== 'undefined') {
    (window as any).__testPatrolAlert = testNotify;
  }

  const {
    selectedAgentId,
    selectAgent,
    getAgentStatus,
    clearAgent,
    restrictAgent,
    suspendAgent,
    getClustersWithCurrentStatus,
    agents,
    isLoading: agentsLoading,
    isError: agentsError,
  } = useAgentState();

  const getAgentPosition = useCallback(
    (agentId: string) => getAgentDeskPosition(agentId, agents),
    [agents],
  );
  const {
    responseState,
    triggerManual,
    onPatrolArrived,
    onInvestigatorArrived,
    onNetworkArrived,
    onPatrolReturnArrived,
    onInvestigatorReturnArrived,
    onNetworkReturnArrived,
  } = usePatrolResponseSequence(notification, dismiss, getAgentPosition);

  const startInvestigationMutation = useStartInvestigation();

  const agentIds = useMemo(() => agents.map((a) => a.id), [agents]);
  const agentNames = useMemo(() => Object.fromEntries(agents.map((a) => [a.id, a.name])), [agents]);

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
  } = useTimelineState({
    useMocks: USE_MOCKS,
    agentIds,
    agentNames,
  });

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

  const allCaseFiles = USE_MOCKS ? mockCaseFiles : caseFiles;
  const selectedCaseFile = allCaseFiles.find(c => c.investigationId === selectedCaseId) ?? null;

  const handleSelectCase = useCallback((caseId: string) => {
    setSelectedCaseId(prev => prev === caseId ? null : caseId);
  }, []);

  // Handle patrol selection from sprite view
  const handlePatrolSelect = useCallback((selection: PatrolSelection | null) => {
    setPatrolSelection(selection);
  }, []);

  // Handle agent assignment from sidebar — same flow as notification: visual sequence + backend investigation
  const handleAgentAssign = useCallback((targetAgentId: string) => {
    if (!patrolSelection) return;
    const patrolId = patrolSelection.patrolId as 'p1' | 'p2';

    // 1. Start visual response sequence (patrol moving → summoning → at_scene → returning → reporting)
    triggerManual(patrolId, targetAgentId);
    setPatrolSelection(null);

    // 2. Start backend investigation (same as when patrol flag occurs — creates investigation, runs pipeline, produces case file)
    startInvestigationMutation.mutate({
      flag_id: `manual-${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
      target_agent_id: targetAgentId,
      consensus_severity: 'HIGH',
      consensus_confidence: 1,
      votes: [],
      pii_labels_union: [],
      referral_summary: 'Manual patrol assignment by operator',
      pheromone_level: 0,
    });
  }, [patrolSelection, triggerManual, startInvestigationMutation]);

  // Cancel patrol selection
  const handleCancelPatrolSelection = useCallback(() => {
    setPatrolSelection(null);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#0a0e1a]">
      {/* Top Bar - 48px */}
      <TopBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        sidebarMode={sidebarMode}
        onSidebarModeChange={handleSidebarModeChange}
        agentCount={agents.length}
        useMocks={USE_MOCKS}
      />

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
                isLoading={!USE_MOCKS && agentsLoading}
                isError={!USE_MOCKS && !!agentsError}
                useMocks={USE_MOCKS}
              />
            )}
            {sidebarMode === 'investigations' && (
              <InvestigationRegistry
                cases={USE_MOCKS ? mockCaseFiles : caseFiles}
                selectedCaseId={selectedCaseId}
                onSelectCase={handleSelectCase}
                isLoading={!USE_MOCKS && casesLoading}
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
          {/* Patrol alert banner */}
          {notification && (
            <PatrolAlertBanner
              notification={notification}
              onDismiss={dismiss}
              onAgentClick={selectAgent}
            />
          )}

          {viewMode === 'graph' ? (
            <BehavioralGraph
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              getAgentStatus={getAgentStatus}
              historicalAgentStates={currentAgentStates}
              isLive={isLive}
              patrolSelection={patrolSelection}
              onPatrolSelect={handlePatrolSelect}
              showHeatmap={sidebarMode === 'analytics'}
              response={responseState}
              useMocks={USE_MOCKS}
            />
          ) : (
            <SpriteView
              selectedAgentId={selectedAgentId}
              onSelectAgent={selectAgent}
              getAgentStatus={getAgentStatus}
              historicalAgentStates={currentAgentStates}
              isLive={isLive}
              patrolSelection={patrolSelection}
              onPatrolSelect={handlePatrolSelect}
              agents={agents}
              response={{
                respondingPatrolId: responseState.patrolId,
                patrolTargetPos: responseState.patrolTargetPos,
                onPatrolArrived,
                onPatrolReturnArrived,
                investigatorTargetPos: responseState.investigatorTargetPos,
                onInvestigatorArrived,
                onInvestigatorReturnArrived,
                networkTargetPos: responseState.networkTargetPos,
                onNetworkArrived,
                onNetworkReturnArrived,
                phase: responseState.phase,
              }}
            />
          )}
        </div>

        {/* Right Sidebar - 15% */}
        <div className="w-[15%] min-w-[240px]">
          <ContextPanel
            selectedAgentId={selectedAgentId}
            agents={agents}
            onClear={clearAgent}
            onRestrict={restrictAgent}
            onSuspend={suspendAgent}
            getAgentStatus={getEffectiveAgentStatus}
            visibleEvents={visibleEvents}
            isLive={isLive}
            patrolSelection={patrolSelection}
            onAgentAssign={handleAgentAssign}
            onCancelPatrolSelection={handleCancelPatrolSelection}
            useMocks={USE_MOCKS}
          />
        </div>
      </div>

      {/* Collapsible Bottom Strip: Incidents & Thought Stream */}
      <BottomStrip useMocks={USE_MOCKS} agentIds={agentIds} agentNames={agentNames} />

      {/* Case File Modal */}
      {selectedCaseFile && (
        <CaseFileModal
          caseFile={selectedCaseFile}
          onClose={() => setSelectedCaseId(null)}
          onClear={clearAgent}
          onRestrict={restrictAgent}
          onSuspend={suspendAgent}
          useLiveDetail={!USE_MOCKS}
        />
      )}

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
