# Frontend Implementation Plan: API Integration

> **Purpose:** Actionable, step-by-step plan to replace mock data with live API data in the SONEX frontend. Based on [API_INTEGRATION_PLAN.md](./API_INTEGRATION_PLAN.md).

---

## Current State Summary

| Area | Status |
|------|--------|
| **TanStack Query** | ❌ Not installed |
| **API Client Layer** | ❌ None |
| **Providers / Layout** | ❌ No QueryClientProvider |
| **Types** | ✅ Partially aligned; need backend types (SwarmStatus, PatrolFlag, etc.) |
| **Adapters** | ✅ `app/lib/adapters.ts` exists with Agent, InvestigatorReport, etc.; missing Incident synthesis, CaseFile Sentence enum |
| **Mock Data Consumers** | 9 files: `page.tsx`, `useAgentState.ts`, `useTimelineState.ts`, `ContextPanel`, `IncidentFeed`, `EntityLayer`, `ViolationChart`, `BehavioralGraph`, `ThoughtStream`, `AnalyticsSidebar`, `InvestigationRegistry` |

---

## Implementation Phases

### Phase 1: Foundation (Day 1)

#### 1.1 Install Dependencies

```bash
cd frontend
npm install @tanstack/react-query @tanstack/react-query-devtools
```

#### 1.2 Environment Setup

- [ ] Create `frontend/.env.local`:

  ```env
  NEXT_PUBLIC_BRIDGE_API_URL=http://localhost:3001
  NEXT_PUBLIC_PATROL_API_URL=http://localhost:8001
  NEXT_PUBLIC_INVESTIGATION_API_URL=http://localhost:8002
  ```

- [ ] Create `frontend/.env.example` (same values, committed, no secrets)
- [ ] Add `.env.local` to `.gitignore` if not already

#### 1.3 QueryClient Provider

- [ ] Create `app/providers.tsx`:

  ```tsx
  'use client';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
  import { useState } from 'react';

  export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(() => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5_000,
          retry: 2,
          refetchOnWindowFocus: true,
        },
      },
    }));

    return (
      <QueryClientProvider client={queryClient}>
        {children}
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    );
  }
  ```

- [ ] Update `app/layout.tsx`: wrap `{children}` with `<Providers>`

#### 1.4 API Client Layer

- [ ] Create `app/lib/api/config.ts` — API base URLs from env
- [ ] Create `app/lib/api/fetcher.ts` — shared `apiFetch<T>()` + `ApiError` class
- [ ] Create `app/lib/api/bridgeApi.ts` — 11 functions (getHealth, getAgents, getAgent, etc.)
- [ ] Create `app/lib/api/patrolApi.ts` — 6 functions (getSwarmStatus, getFlags, getPheromones, etc.)
- [ ] Create `app/lib/api/investigationApi.ts` — 5 functions (getHealth, listInvestigations, startInvestigation, etc.)

**Deliverable:** App boots with TanStack Query; API layer ready but not yet used.

---

### Phase 2: Types & Adapters (Day 2 Morning)

#### 2.1 Extend Types (`app/types/index.ts`)

- [ ] Add `Sentence` enum: `quarantine | suspend | warn | monitor | cleared` (align with backend)
- [ ] Add `SwarmStatus` — pool, cycle info, assignments
- [ ] Add `PheromoneMap` — `Record<string, number>`
- [ ] Add `PatrolFlag` — quorum referral (flag_id, target_agent_id, consensus_severity, votes, referral_summary, etc.)
- [ ] Add `SweepResult` — sweep_id, cycle_number, agents_scanned, signals_posted, duration_ms
- [ ] Add `AgentProfile` — full registry entry (superset of Agent)
- [ ] Update `CaseFile.verdict` / `sentence` if backend uses different values
- [ ] Add optional fields to `InvestigatorReport`, `DamageReport` per plan §4.3

#### 2.2 Extend Adapters (`app/lib/adapters.ts`)

- [ ] **`adaptAgent`** — update to accept pheromone + investigation context; derive `status` and `record`
- [ ] **`deriveAgentStatus(pheromoneLevel, investigations)`** — utility returning `{ status, record }`
- [ ] **`adaptIncidentFromFlag(flag: PatrolFlag) → Incident`** — synthesize from flag
- [ ] **`adaptIncidentFromViolation(actionLog: AgentActionLog) → Incident`** — synthesize from violation
- [ ] **`synthesizeIncidents(flags, violationLogs) → Incident[]`** — merge and sort
- [ ] Update **`adaptDamageReport`** — `damage_severity` lowercase → uppercase
- [ ] Update **`adaptCaseFile`** — map `sentence` enum (`quarantine`→`suspend`, etc.)

**Deliverable:** All backend → frontend transforms implemented.

---

### Phase 3: Bridge DB Integration (Day 2 Afternoon)

#### 3.1 TanStack Query Hooks — Bridge DB

- [ ] Create `app/hooks/api/useBridgeQueries.ts`:

  | Hook | Query Key | Poll Interval |
  |------|-----------|---------------|
  | `useAgents()` | `['agents']` | 30s |
  | `useAgent(id)` | `['agent', id]` | on-demand |
  | `useAgentCommunications(id)` | `['agent-comms', id]` | on-demand |
  | `useAgentActions(id)` | `['agent-actions', id]` | on-demand |
  | `useAgentNetwork(id)` | `['agent-network', id]` | on-demand |
  | `useMessages()` | `['messages']` | 15s |
  | `useInvestigations()` | `['investigations']` | 10s |
  | `useInvestigation(id)` | `['investigation', id]` | 5s (adaptive) |

#### 3.2 Refactor `useAgentState`

- [ ] Replace mock `initialAgents` / `initialClusters` with `useAgents()`
- [ ] Derive clusters from agents (host/cluster grouping from backend or client-side)
- [ ] Integrate `usePheromones()` and `deriveAgentStatus` for status
- [ ] Preserve `selectAgent`, `clearAgent`, `restrictAgent`, `suspendAgent` (may become no-ops or call future APIs)

#### 3.3 Wire Components — Bridge DB

- [ ] **AgentRegistry** — consume clusters from `useAgentState` (which uses `useAgents()`)
- [ ] **InvestigationRegistry** — use `useInvestigations()` instead of `caseFiles` prop from page
- [ ] **ContextPanel** — use `useInvestigationDetail(selectedCaseId)` when case selected; `useAgent(selectedAgentId)` when agent selected
- [ ] **ViolationChart** — derive violation counts from `useAgentActions` per agent (or aggregate hook)

**Deliverable:** Agent list, investigations, and context panel use live Bridge DB data.

---

### Phase 4: Patrol Swarm Integration (Day 3 Morning)

#### 4.1 TanStack Query Hooks — Patrol

- [ ] Create `app/hooks/api/usePatrolQueries.ts`:

  | Hook | Query Key | Poll Interval |
  |------|-----------|---------------|
  | `useSwarmStatus()` | `['swarm-status']` | 5s |
  | `useFlags()` | `['swarm-flags']` | 10s |
  | `usePheromones()` | `['pheromones']` | 5s |
  | `useSweeps()` | `['swarms']` | 30s |

#### 4.2 Wire Components — Patrol

- [ ] **TopBar** — use `useSwarmStatus()` for live counters (agents scanned, sweep cycle, etc.)
- [ ] **IncidentFeed** — use `useFlags()` + `synthesizeIncidents(flags, violationLogs)`; get violations from Bridge DB
- [ ] **AgentRegistry / BehavioralGraph / DonutChart** — integrate `usePheromones()` into `deriveAgentStatus`
- [ ] **ViolationChart** — feed violation counts from Bridge DB action logs

#### 4.3 Mutation: Trigger Sweep

- [ ] Create `useTriggerSweep()` mutation in `usePatrolQueries.ts`
- [ ] Add "Trigger Sweep" button to TopBar (or settings) that calls `useTriggerSweep()`

**Deliverable:** Patrol status, flags, pheromones, and incidents are live; sweep can be triggered.

---

### Phase 5: Investigation Integration (Day 3 Afternoon)

#### 5.1 TanStack Query Hooks — Investigation

- [ ] Create `app/hooks/api/useInvestigationQueries.ts`:

  | Hook | Query Key | Poll Interval |
  |------|-----------|---------------|
  | `useInvestigationList()` | `['investigation-list']` | 15s |
  | `useInvestigationDetail(id)` | `['investigation-detail', id]` | 3s (adaptive for in_progress) |
  | `useInvestigationHealth()` | `['investigation-health']` | 60s |

#### 5.2 Mutation: Start Investigation

- [ ] Create `useStartInvestigation()` mutation
- [ ] Wire "Investigate" button in ContextPanel (when flag/case selected) to `useStartInvestigation()`
- [ ] On success: start polling `useInvestigationDetail(investigation_id)`; optionally auto-select the new case

#### 5.3 Wire ContextPanel Fully

- [ ] When `selectedAgentId` set: show agent detail (activity, communications, actions) from Bridge DB
- [ ] When `selectedCaseId` set: show investigation stages from Investigation API
- [ ] Use adaptive polling for `useInvestigationDetail` (stop when `status === 'concluded'`)

**Deliverable:** Investigations can be started and tracked live; ContextPanel shows full case file.

---

### Phase 6: SSE Real-Time (Day 4)

#### 6.1 Generic SSE Hook

- [ ] Create `app/hooks/api/useEventStream.ts`:
  - Generic `useEventStream<T>(url, handlers)` — opens EventSource, parses events, auto-reconnect with backoff
  - Returns `isConnected` boolean

#### 6.2 Service-Specific SSE Hooks

- [ ] **`usePatrolStream()`** — connects to `GET /api/swarm/stream`
  - On `flag` → invalidate `['swarm-flags']`
  - On `pheromone_update` → invalidate `['pheromones']`
  - On `sweep_complete` → invalidate `['swarms']`, `['swarm-status']`
  - On `flag` — optionally push to ThoughtStream
- [ ] **`useInvestigationStream()`** — connects to `GET /api/investigation/stream`
  - On `stage_complete` → optimistic cache update
  - On `investigation_concluded` → invalidate `['investigation-detail', id]`, `['investigations']`
  - On `investigation_started` — push to ThoughtStream
- [ ] **`useBridgeStream()`** — placeholder for when Bridge DB adds `GET /api/db/stream`
  - Document as TODO; implement once backend is ready

#### 6.3 SSE + Polling Fallback

- [ ] In patrol flags hook: if `usePatrolStream().isConnected`, set `refetchInterval: false`; else poll at 5s
- [ ] Same pattern for pheromones, sweeps

#### 6.4 Wire ThoughtStream

- [ ] Replace `thoughtMessages` mock with events from `usePatrolStream()` and `useInvestigationStream()`
- [ ] Maintain a buffer of recent "thought" events (stage_complete, flag, sweep messages)

**Deliverable:** Real-time updates via SSE; ThoughtStream shows live agent/system thoughts.

---

### Phase 7: Graph & Visualization (Day 5)

#### 7.1 Graph Node Generation

- [ ] Create utility `buildGraphNodes(agents, swarmStatus, pheromones)`:
  - Agent nodes from `/api/db/agents` with positions (layout algo or stored)
  - System nodes (Patrol, Superintendent, Investigator) from swarm status
  - Status from `deriveAgentStatus`
- [ ] Create utility `buildGraphEdges(agents, agentNetworks)`:
  - Edges from `/api/db/agents/{id}/network`
  - Dynamic edges for active investigations (investigator ↔ target)

#### 7.2 Wire BehavioralGraph

- [ ] Replace `graphNodes` / `graphEdges` from mockData with:
  - `useAgents()`, `useSwarmStatus()`, `usePheromones()`
  - `useAgentNetwork(id)` for selected agent or all (batch if needed)
- [ ] Generate nodes/edges via `buildGraphNodes` and `buildGraphEdges`

#### 7.3 Wire SpriteView / EntityLayer

- [ ] EntityLayer: replace `agents`, `agentActivityStatuses` from mockData with `useAgents()`, `usePheromones()`
- [ ] Agent sprites use live agent list; status from pheromones + investigations

#### 7.4 Wire Timeline

- [ ] `useTimelineState`: replace `timelineEvents`, `agentStateHistory` with synthesized data:
  - `synthesizeTimelineEvents(flags, sweeps, violations, thoughtBuffer)`
  - `synthesizeAgentStateHistory(pheromonesOverTime, investigations)` — if backend provides history, else derive from events

**Deliverable:** Graph, SpriteView, and Timeline use live API data.

---

### Phase 8: Polish (Day 6)

#### 8.1 Loading States

- [ ] AgentRegistry — shimmer/skeleton while `useAgents().isLoading`
- [ ] BehavioralGraph — "Loading..." overlay
- [ ] ContextPanel — skeleton cards
- [ ] IncidentFeed — pulsing placeholders
- [ ] InvestigationRegistry — skeleton list

#### 8.2 Error Handling

- [ ] Create `QueryErrorBoundary` or equivalent:
  - Service-specific messages ("Bridge DB unavailable", "Patrol Swarm offline")
  - Retry button
  - Stale cache fallback when available
- [ ] Optional: per-hook `onError` toasts for critical failures

#### 8.3 Service Health Indicators

- [ ] Add health check indicators to TopBar:
  - Green / yellow / red dots for Bridge DB, Patrol, Investigation
  - Use `getHealth()` on 60s intervals

#### 8.4 Mock Data Fallback

- [ ] Gate mock data behind `NEXT_PUBLIC_USE_MOCKS=true`
- [ ] When mocks enabled: skip API calls, use mockData
- [ ] When mocks disabled: full API flow

#### 8.5 Cleanup

- [ ] Remove or deprecate direct mockData imports from components
- [ ] Keep `mockData.ts` only for mock mode
- [ ] Update `InvestigationRegistry` to work with both case selection and agent selection flows

**Deliverable:** Production-ready UI with loading states, error handling, and health indicators.

---

## File Structure (Final)

```
frontend/app/
├── lib/
│   ├── api/
│   │   ├── config.ts
│   │   ├── fetcher.ts
│   │   ├── bridgeApi.ts
│   │   ├── patrolApi.ts
│   │   └── investigationApi.ts
│   └── adapters.ts
├── hooks/
│   ├── api/
│   │   ├── useBridgeQueries.ts
│   │   ├── usePatrolQueries.ts
│   │   ├── useInvestigationQueries.ts
│   │   └── useEventStream.ts
│   ├── useAgentState.ts       (refactored)
│   └── useTimelineState.ts    (refactored)
├── providers.tsx
├── types/
│   └── index.ts
├── data/
│   └── mockData.ts            (gated behind NEXT_PUBLIC_USE_MOCKS)
└── components/                (updated to use hooks)
```

---

## Component → Hook Mapping (Quick Reference)

| Component | Hooks | Notes |
|-----------|-------|-------|
| **AgentRegistry** | `useAgentState` (→ `useAgents`, `usePheromones`) | Clusters from agents + host grouping |
| **ViolationChart** | `useAgents`, `useAgentActions` (or derived `useAgentViolationCounts`) | Count violations per agent |
| **BehavioralGraph** | `useAgents`, `useSwarmStatus`, `usePheromones`, `useAgentNetwork` | Generate nodes/edges dynamically |
| **SpriteView / EntityLayer** | `useAgents`, `usePheromones`, `useSwarmStatus` | Live agent list + status |
| **ContextPanel** | `useInvestigationDetail`, `useAgent`, `useAgentCommunications`, `useAgentActions` | Agent vs case view |
| **InvestigationRegistry** | `useInvestigations` | Replace caseFiles prop |
| **IncidentFeed** | `useFlags`, `useAgentActions` (violations), `synthesizeIncidents` | Patrol flags + Bridge violations |
| **ThoughtStream** | `usePatrolStream`, `useInvestigationStream` | SSE events |
| **Timeline** | `useFlags`, `useSweeps`, synthesized events | From flags, sweeps, violations |
| **TopBar** | `useSwarmStatus`, health checks | Counters + health indicators |
| **DonutChart** | `useAgents`, `usePheromones` | Status distribution |
| **AnalyticsSidebar** | `useAgents`, `usePheromones`, `useFlags`, `useInvestigations` | Aggregated metrics |

---

## Dependencies & Ordering

- **Phase 1** is blocking for all others
- **Phase 2** (types/adapters) is needed before Phase 3–5
- **Phase 3** and **Phase 4** can be parallelized after Phase 2
- **Phase 5** builds on Phase 3 (investigation detail) and Phase 4 (flags for "Investigate" trigger)
- **Phase 6** (SSE) enhances Phases 3–5; can be done in parallel or after
- **Phase 7** depends on Phases 3 and 4
- **Phase 8** can be done incrementally alongside Phases 3–7

---

## Testing Checklist (End-to-End)

- [ ] All three services running (Bridge DB :3001, Patrol :8001, Investigation :8002)
- [ ] AgentRegistry shows agents from Bridge DB
- [ ] Selecting agent loads detail in ContextPanel
- [ ] IncidentFeed shows flags + violations
- [ ] Trigger Sweep updates swarm status and flags
- [ ] Start Investigation flows through stages; ContextPanel updates
- [ ] SSE delivers real-time flag/sweep/stage events
- [ ] BehavioralGraph and SpriteView render with live data
- [ ] Timeline shows synthesized events
- [ ] Health indicators reflect service status
- [ ] Loading skeletons appear during fetches
- [ ] Error boundary handles service outages gracefully
