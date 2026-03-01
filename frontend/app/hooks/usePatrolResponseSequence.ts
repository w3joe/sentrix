'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useCaseFiles } from './api/useBridgeQueries';
import { getDeskPosition, controlRoom, patrolWaypoints } from '../components/CenterPanel/SpriteView/config/roomLayout';
import type { PatrolNotification } from './usePatrolFlagNotifications';

// How long to wait for a case file before giving up (ms)
const CASE_FILE_TIMEOUT_MS = 30_000;
// How long responders stand beside superintendent before returning to idle (ms)
const REPORT_DURATION_MS = 5_000;

export type ResponsePhase =
  | 'idle'
  | 'patrol_moving'
  | 'summoning'
  | 'at_scene'
  | 'returning'
  | 'reporting';

export interface PatrolResponseState {
  phase: ResponsePhase;
  patrolId: 'p1' | 'p2' | null;
  flaggedAgentId: string | null;
  /** Target position patrol should move to (beside flagged agent) */
  patrolTargetPos: { x: number; y: number } | null;
  /** Target position investigator f1 should move to (beside flagged agent) */
  investigatorTargetPos: { x: number; y: number } | null;
  /** Target position network should move to (beside flagged agent) */
  networkTargetPos: { x: number; y: number } | null;
}

const IDLE_STATE: PatrolResponseState = {
  phase: 'idle',
  patrolId: null,
  flaggedAgentId: null,
  patrolTargetPos: null,
  investigatorTargetPos: null,
  networkTargetPos: null,
};

/** Euclidean distance between two positions */
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Pick the patrol (p1 or p2) closest to the flagged agent desk position */
function pickClosestPatrol(
  agentPos: { x: number; y: number },
  p1WaypointIdx: number,
  p2WaypointIdx: number,
): 'p1' | 'p2' {
  const p1Pos = patrolWaypoints[p1WaypointIdx] ?? patrolWaypoints[0];
  const p2Pos = patrolWaypoints[p2WaypointIdx] ?? patrolWaypoints[Math.floor(patrolWaypoints.length / 2)];
  return dist(p1Pos, agentPos) <= dist(p2Pos, agentPos) ? 'p1' : 'p2';
}

/** Stand-beside offsets for each responder so they cluster without overlapping */
const OFFSETS = {
  patrol:      { dx: -45, dy: 0 },
  investigator: { dx: +45, dy: 0 },
  network:     { dx: 0,   dy: -45 },
};

const SUPERINTENDENT_POS = controlRoom.superintendentPos;

/** Optional: resolves position for live API agent IDs (getDeskPosition only knows static mock IDs) */
export type GetAgentPosition = (agentId: string) => { x: number; y: number } | null;

export function usePatrolResponseSequence(
  notification: PatrolNotification | null,
  dismiss: () => void,
  getAgentPosition?: GetAgentPosition,
) {
  const resolvePos = useCallback(
    (agentId: string) => (getAgentPosition?.(agentId) ?? getDeskPosition(agentId)),
    [getAgentPosition],
  );
  const { data: caseFiles = [] } = useCaseFiles();

  const [state, setState] = useState<PatrolResponseState>(IDLE_STATE);
  const stateRef = useRef(state);

  // Track current patrol waypoint indices (approximate — used only for "which patrol is closer")
  // We start with the same defaults as usePatrolTargetMovement
  const p1WaypointIdx = 0;
  const p2WaypointIdx = Math.floor(patrolWaypoints.length / 2);

  // Refs for timers so we can clear them on reset
  const caseFileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (caseFileTimerRef.current) { clearTimeout(caseFileTimerRef.current); caseFileTimerRef.current = null; }
    if (reportTimerRef.current) { clearTimeout(reportTimerRef.current); reportTimerRef.current = null; }
  }, []);

  const resetToIdle = useCallback(() => {
    clearTimers();
    setState(IDLE_STATE);
    stateRef.current = IDLE_STATE;
  }, [clearTimers]);

  const triggerManual = useCallback((patrolId: 'p1' | 'p2', targetAgentId: string) => {
    if (stateRef.current.phase !== 'idle') return;
    const agentPos = resolvePos(targetAgentId);
    if (!agentPos) return;
    const patrolTarget = { x: agentPos.x + OFFSETS.patrol.dx, y: agentPos.y + OFFSETS.patrol.dy };
    const next: PatrolResponseState = {
      phase: 'patrol_moving',
      patrolId,
      flaggedAgentId: targetAgentId,
      patrolTargetPos: patrolTarget,
      investigatorTargetPos: null,
      networkTargetPos: null,
    };
    setState(next);
    stateRef.current = next;
  }, [resolvePos]);

  const startReturning = useCallback(() => {
    clearTimers();
    setState((prev) => {
      const next: PatrolResponseState = {
        ...prev,
        phase: 'returning',
        patrolTargetPos: { x: SUPERINTENDENT_POS.x - 60, y: SUPERINTENDENT_POS.y },
        investigatorTargetPos: { x: SUPERINTENDENT_POS.x + 60, y: SUPERINTENDENT_POS.y },
        networkTargetPos: { x: SUPERINTENDENT_POS.x, y: SUPERINTENDENT_POS.y - 60 },
      };
      stateRef.current = next;
      return next;
    });
  }, [clearTimers]);

  // ── Step 1: New notification fires → start PATROL_MOVING ──────────────────
  useEffect(() => {
    if (!notification) return;
    if (stateRef.current.phase !== 'idle') return; // already handling one

    const agentId = notification.agentId;
    const agentPos = resolvePos(agentId);
    if (!agentPos) {
      dismiss();
      return;
    }

    const patrolId = pickClosestPatrol(agentPos, p1WaypointIdx, p2WaypointIdx);
    const patrolTarget = { x: agentPos.x + OFFSETS.patrol.dx, y: agentPos.y + OFFSETS.patrol.dy };

    const next: PatrolResponseState = {
      phase: 'patrol_moving',
      patrolId,
      flaggedAgentId: agentId,
      patrolTargetPos: patrolTarget,
      investigatorTargetPos: null,
      networkTargetPos: null,
    };
    setState(next);
    stateRef.current = next;
    dismiss(); // consume the notification so it doesn't re-trigger
  }, [notification, dismiss, resolvePos]);

  // ── Step 2: Called by PatrolSprite onArrived → SUMMONING ─────────────────
  const onPatrolArrived = useCallback(() => {
    if (stateRef.current.phase !== 'patrol_moving') return;

    const agentId = stateRef.current.flaggedAgentId;
    const agentPos = agentId ? resolvePos(agentId) : null;
    if (!agentPos) { resetToIdle(); return; }

    const investigatorTarget = {
      x: agentPos.x + OFFSETS.investigator.dx,
      y: agentPos.y + OFFSETS.investigator.dy,
    };
    const networkTarget = {
      x: agentPos.x + OFFSETS.network.dx,
      y: agentPos.y + OFFSETS.network.dy,
    };

    const next: PatrolResponseState = {
      ...stateRef.current,
      phase: 'summoning',
      investigatorTargetPos: investigatorTarget,
      networkTargetPos: networkTarget,
    };
    setState(next);
    stateRef.current = next;
  }, [resetToIdle, resolvePos]);

  // ── Step 3: Both investigator and network arrived → AT_SCENE ──────────────
  const arrivedRef = useRef({ investigator: false, network: false });

  const onInvestigatorArrived = useCallback(() => {
    if (stateRef.current.phase !== 'summoning') return;
    arrivedRef.current.investigator = true;
    if (arrivedRef.current.network) transitionToAtScene();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onNetworkArrived = useCallback(() => {
    if (stateRef.current.phase !== 'summoning') return;
    arrivedRef.current.network = true;
    if (arrivedRef.current.investigator) transitionToAtScene();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function transitionToAtScene() {
    arrivedRef.current = { investigator: false, network: false };
    const next: PatrolResponseState = { ...stateRef.current, phase: 'at_scene' };
    setState(next);
    stateRef.current = next;

    // Start fallback timer
    caseFileTimerRef.current = setTimeout(() => {
      if (stateRef.current.phase === 'at_scene') startReturning();
    }, CASE_FILE_TIMEOUT_MS);
  }

  // ── Step 4: Case file appears in DB for flagged agent → RETURNING ────────
  useEffect(() => {
    if (stateRef.current.phase !== 'at_scene') return;
    const agentId = stateRef.current.flaggedAgentId;
    if (!agentId) return;

    const resolved = caseFiles.find(
      (cf) => cf.targetAgentId === agentId && cf.status === 'concluded'
    );
    if (resolved) {
      startReturning();
    }
  }, [caseFiles, startReturning]);

  // ── Step 5: All returned to superintendent → REPORTING ───────────────────
  const returnArrivedRef = useRef({ patrol: false, investigator: false, network: false });

  const onPatrolReturnArrived = useCallback(() => {
    if (stateRef.current.phase !== 'returning') return;
    returnArrivedRef.current.patrol = true;
    if (returnArrivedRef.current.investigator && returnArrivedRef.current.network) transitionToReporting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onInvestigatorReturnArrived = useCallback(() => {
    if (stateRef.current.phase !== 'returning') return;
    returnArrivedRef.current.investigator = true;
    if (returnArrivedRef.current.patrol && returnArrivedRef.current.network) transitionToReporting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onNetworkReturnArrived = useCallback(() => {
    if (stateRef.current.phase !== 'returning') return;
    returnArrivedRef.current.network = true;
    if (returnArrivedRef.current.patrol && returnArrivedRef.current.investigator) transitionToReporting();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function transitionToReporting() {
    returnArrivedRef.current = { patrol: false, investigator: false, network: false };
    const next: PatrolResponseState = { ...stateRef.current, phase: 'reporting' };
    setState(next);
    stateRef.current = next;

    reportTimerRef.current = setTimeout(() => {
      resetToIdle();
    }, REPORT_DURATION_MS);
  }

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    responseState: state,
    triggerManual,
    onPatrolArrived,
    onInvestigatorArrived,
    onNetworkArrived,
    onPatrolReturnArrived,
    onInvestigatorReturnArrived,
    onNetworkReturnArrived,
  };
}
