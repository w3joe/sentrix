# API Integration Plan: Bridge DB + Patrol Swarm + Investigation

> **Goal:** Replace all mock data in the SONEX frontend with live data from the three FastAPI microservices, using TanStack Query for caching/polling and SSE for real-time event streams.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Backend SSE Endpoints (New)](#2-backend-sse-endpoints-new)
3. [Frontend Infrastructure Setup](#3-frontend-infrastructure-setup)
4. [Type Alignment & Adapters](#4-type-alignment--adapters)
5. [API Client Layer](#5-api-client-layer)
6. [TanStack Query Hooks](#6-tanstack-query-hooks)
7. [SSE Integration](#7-sse-integration)
8. [Component Wiring](#8-component-wiring)
9. [Write Actions (POST Endpoints)](#9-write-actions-post-endpoints)
10. [Error Handling & Loading States](#10-error-handling--loading-states)
11. [Implementation Order](#11-implementation-order)
12. [File Structure](#12-file-structure)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        NEXT.JS FRONTEND                         │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │ TanStack     │  │ SSE Hooks    │  │ Mutation Hooks        │ │
│  │ Query Hooks  │  │ (EventSource)│  │ (POST actions)        │ │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬───────────┘ │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐ │
│  │                    API Client Layer                        │ │
│  │  bridgeApi.ts  │  patrolApi.ts  │  investigationApi.ts     │ │
│  └──────┬─────────────────┬──────────────────────┬───────────┘ │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐ │
│  │              Environment Config (.env.local)               │ │
│  │  NEXT_PUBLIC_BRIDGE_API_URL=http://localhost:3001          │ │
│  │  NEXT_PUBLIC_PATROL_API_URL=http://localhost:8001          │ │
│  │  NEXT_PUBLIC_INVESTIGATION_API_URL=http://localhost:8002   │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────┬─────────────┬──────────────┬─────────────┘
                      │             │              │
              ┌───────▼──┐  ┌──────▼───┐  ┌───────▼────────┐
              │ Bridge DB│  │ Patrol   │  │ Investigation  │
              │ :3001    │  │ Swarm    │  │ Workflow       │
              │          │  │ :8001    │  │ :8002          │
              └──────────┘  └──────────┘  └────────────────┘
```

### Services Summary

| Service              | Port  | Role                                      | Endpoints Used |
|----------------------|-------|-------------------------------------------|----------------|
| **Bridge DB**        | 3001  | Agent registry, A2A messages, action logs, investigation records | 11 GET + 1 POST |
| **Patrol Swarm**     | 8001  | Swarm status, flags, pheromones, sweep cycles | 5 GET + 1 POST (incl. SSE) |
| **Investigation**    | 8002  | Investigation lifecycle (create, status, list) | 4 GET + 1 POST (incl. SSE) |

---

## 2. Backend SSE Endpoints

> **Status:** Patrol Swarm and Investigation SSE endpoints are **implemented**. Bridge DB SSE is **planned**.

### 2.1 Patrol Swarm — `GET /api/swarm/stream` ✅ IMPLEMENTED

**File:** `patrolswarm/patrol_swarm/api.py`

**Architecture:** The existing `_on_cycle_complete` callback (called by `SwarmScheduler` after every sweep) fans out events to an `_sse_subscribers` list of per-client `asyncio.Queue`s. Each connected SSE client gets its own queue (maxsize=256). Stale/slow clients are automatically dropped.

**Event types:**

| Event | Trigger | Payload |
|-------|---------|---------|
| `flag` | New PatrolFlag produced (quorum referral) | Full PatrolFlag dict (`flag_id`, `target_agent_id`, `consensus_severity`, `votes`, etc.) |
| `sweep_complete` | Sweep cycle finished | Latest `SweepResult` (`sweep_id`, `cycle_number`, `agents_scanned`, `signals_posted`, `duration_ms`, etc.) |
| `pheromone_update` | After each sweep | Full pheromone map: `{"agent_id": level, ...}` |
| `ping` | Every 15s (keep-alive) | Empty string |

**Example SSE stream:**
```
event: flag
data: {"flag_id": "abc-123", "target_agent_id": "email_0", "consensus_severity": "HIGH", ...}

event: sweep_complete
data: {"sweep_id": "def-456", "cycle_number": 5, "agents_scanned": ["email_0", "code_1"], "duration_ms": 1234.5}

event: pheromone_update
data: {"email_0": 0.73, "code_1": 0.12, "doc_2": 0.0}
```

### 2.2 Bridge DB — `GET /api/db/stream` ⏳ PLANNED

**File:** `bridge_db/api.py`

**Streams (to implement):**
- New action log entries (violations)
- New A2A messages
- Investigation status changes

**Event format:**
```
event: action_log
data: {"action_id": "...", "agent_id": "...", "violation": true, ...}

event: a2a_message
data: {"message_id": "...", "sender_id": "...", ...}

event: investigation_update
data: {"investigation_id": "...", "status": "concluded", ...}
```

### 2.3 Investigation — `GET /api/investigation/stream` ✅ IMPLEMENTED

**File:** `investigation/api.py`

**Architecture:** `_run_investigation` uses `graph.astream()` (instead of `graph.ainvoke()`) to capture each LangGraph node completion as it happens. Each node completion triggers an SSE broadcast via the same per-client `asyncio.Queue` fan-out pattern as patrol swarm.

**Route ordering:** The `/api/investigation/stream` endpoint is registered **before** the `/{investigation_id}` catch-all route so FastAPI doesn't match "stream" as an investigation ID.

**Event types:**

| Event | Trigger | Payload |
|-------|---------|---------|
| `investigation_started` | New investigation opened | `investigation_id`, `target_agent_id`, `status` |
| `stage_complete` | A pipeline stage finished (setup, investigator, network_analyser, damage_analysis, superintendent) | `investigation_id`, `target_agent_id`, `stage`, `result` (stage output dict or null) |
| `investigation_concluded` | Full pipeline complete | `investigation_id`, `target_agent_id`, `status`, `verdict`, `sentence` |
| `investigation_error` | Pipeline failed | `investigation_id`, `target_agent_id`, `error` |
| `ping` | Every 15s (keep-alive) | Empty string |

**Example SSE stream (full investigation lifecycle):**
```
event: investigation_started
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "status": "in_progress"}

event: stage_complete
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "stage": "setup", "result": null}

event: stage_complete
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "stage": "investigator", "result": {"crime_classification": "email_pii_exfiltration", "confidence": 0.91, ...}}

event: stage_complete
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "stage": "network_analyser", "result": {"network_risk_level": "connected", ...}}

event: stage_complete
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "stage": "damage_analysis", "result": {"damage_severity": "high", ...}}

event: stage_complete
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "stage": "superintendent", "result": {"verdict": "confirmed_violation", "sentence": "suspend", ...}}

event: investigation_concluded
data: {"investigation_id": "inv-789", "target_agent_id": "email_0", "status": "concluded", "verdict": "confirmed_violation", "sentence": "suspend"}
```

### 2.4 Backend Dependency

```
pip install sse-starlette>=2.1.0
```

Added to `patrolswarm/requirements.txt` and `investigation/requirements.txt`. ✅

---

## 3. Frontend Infrastructure Setup

### 3.1 Install Dependencies

```bash
cd frontend
npm install @tanstack/react-query @tanstack/react-query-devtools
```

### 3.2 Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_BRIDGE_API_URL=http://localhost:3001
NEXT_PUBLIC_PATROL_API_URL=http://localhost:8001
NEXT_PUBLIC_INVESTIGATION_API_URL=http://localhost:8002
```

Create `frontend/.env.example` (committed, no secrets):

```env
NEXT_PUBLIC_BRIDGE_API_URL=http://localhost:3001
NEXT_PUBLIC_PATROL_API_URL=http://localhost:8001
NEXT_PUBLIC_INVESTIGATION_API_URL=http://localhost:8002
```

### 3.3 QueryClient Provider

Wrap the app in `app/providers.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,          // 5s before refetch
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

Update `app/layout.tsx` to wrap with `<Providers>`.

---

## 4. Type Alignment & Adapters

The frontend TypeScript types and the backend Pydantic models use different naming conventions (camelCase vs snake_case) and have some structural differences. We need adapter functions.

### 4.1 Key Differences

| Frontend Type | Backend Model | Differences |
|---------------|---------------|-------------|
| `Agent` | `agent_registry` row | Backend has `agent_type`, `declared_scope`, `permitted_*` fields; frontend has `name`, `role`, `status`, `record` |
| `InvestigatorReport` | `InvestigatorReport` (Pydantic) | Different field names: `reportId` vs none, `keyFindings` (string) vs `evidence_summary`, missing `modus_operandi` and `agent_profile_anomalies` on frontend |
| `NetworkAnalysis` | `NetworkAnalysis` (Pydantic) | Frontend has `analysisId`, `messagesAnalyzed`; backend has `accomplice_suspicions`, `coordination_evidence` |
| `DamageReport` | `DamageReport` (Pydantic) | Frontend: `damageSeverity` is uppercase enum; backend: lowercase. Frontend has `affectedArtifacts`; backend has `causal_chain` as list, `propagation_risk` |
| `CaseFile` | `CaseFile` (Pydantic) | Frontend has `caseId`, `rootCause`, `sentenceRationale`; backend has `key_findings`, `precedent_cases`. `sentence` enum values differ |
| `Incident` | Derived from `PatrolFlag` + `action_logs` | No direct 1:1 mapping — incidents are synthesized from flags and violations |
| `A2AMessage` | `a2a_messages` row | Direct mapping with snake_case → camelCase |
| `AgentActionLog` | `action_logs` row | Direct mapping with snake_case → camelCase |

### 4.2 Adapter Strategy

Create `app/lib/adapters.ts` with transform functions:

```
Backend snake_case JSON  →  adapter function  →  Frontend camelCase type
```

**Key adapters needed:**

1. **`adaptAgent(raw) → Agent`** — Maps `agent_registry` row to frontend `Agent`. Must derive `status` from pheromone/flag data and `record` from investigation verdicts.

2. **`adaptInvestigatorReport(raw) → InvestigatorReport`** — Maps backend fields to frontend shape, fills missing fields with sensible defaults.

3. **`adaptNetworkAnalysis(raw) → NetworkAnalysis`** — Adds frontend-specific fields like `analysisId`, `messagesAnalyzed`.

4. **`adaptDamageReport(raw) → DamageReport`** — Converts `damage_severity` lowercase → uppercase, maps `causal_chain` list → string narrative.

5. **`adaptCaseFile(raw) → CaseFile`** — Composes all sub-adapters, maps `sentence` enum values (`quarantine`→`suspend`, `warn`→`restrict_scope`, etc.).

6. **`adaptA2AMessage(raw) → A2AMessage`** — snake_case → camelCase.

7. **`adaptActionLog(raw) → AgentActionLog`** — snake_case → camelCase, `violation: 0|1` → `boolean`.

8. **`adaptIncidentFromFlag(flag) → Incident`** — Synthesizes `Incident` from `PatrolFlag` data.

9. **`adaptIncidentFromViolation(actionLog) → Incident`** — Synthesizes `Incident` from `action_logs` violation entries.

### 4.3 Type Updates Needed

The frontend types in `app/types/index.ts` should be updated to:

1. **Add missing fields** that the backend provides (e.g., `modus_operandi`, `agent_profile_anomalies` on `InvestigatorReport`).
2. **Align `Sentence` enum** with backend values: `quarantine | suspend | warn | monitor | cleared`.
3. **Add new types** for backend-specific data:
   - `SwarmStatus` — patrol pool, cycle info, assignments
   - `PheromoneMap` — agent_id → pheromone level
   - `PatrolFlag` — quorum referral from patrol swarm
   - `SweepResult` — sweep cycle metrics
   - `AgentProfile` — full agent registry entry (superset of `Agent`)

---

## 5. API Client Layer

Create thin fetch wrappers for each service. No business logic — just HTTP + JSON parsing.

### 5.1 `app/lib/api/config.ts`

```ts
export const API_URLS = {
  bridge:        process.env.NEXT_PUBLIC_BRIDGE_API_URL   ?? 'http://localhost:3001',
  patrol:        process.env.NEXT_PUBLIC_PATROL_API_URL   ?? 'http://localhost:8001',
  investigation: process.env.NEXT_PUBLIC_INVESTIGATION_API_URL ?? 'http://localhost:8002',
} as const;
```

### 5.2 `app/lib/api/fetcher.ts`

Shared fetch helper with error handling:

```ts
export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return res.json();
}
```

### 5.3 `app/lib/api/bridgeApi.ts`

| Function | HTTP | Endpoint | Returns |
|----------|------|----------|---------|
| `getHealth()` | GET | `/api/db/health` | `{ status, agent_count, graph_stats }` |
| `getAgents()` | GET | `/api/db/agents` | `{ agents: [], count }` |
| `getAgent(id)` | GET | `/api/db/agents/{id}` | Agent profile |
| `getAgentCommunications(id, limit?)` | GET | `/api/db/agents/{id}/communications` | `{ messages: [], count }` |
| `getAgentActions(id, limit?)` | GET | `/api/db/agents/{id}/actions` | `{ actions: [], count }` |
| `getAgentNetwork(id)` | GET | `/api/db/agents/{id}/network` | Network graph data |
| `getMessages()` | GET | `/api/db/messages` | All A2A messages |
| `getInvestigations()` | GET | `/api/db/investigations` | All investigations |
| `getInvestigation(id)` | GET | `/api/db/investigations/{id}` | Single investigation + parsed CaseFile |
| `rebuildGraph()` | POST | `/api/db/graph/rebuild` | `{ status }` |

### 5.4 `app/lib/api/patrolApi.ts`

| Function | HTTP | Endpoint | Returns |
|----------|------|----------|---------|
| `getSwarmStatus()` | GET | `/api/swarm/status` | Pool, cycle, assignments |
| `getFlags()` | GET | `/api/swarm/flags` | `PatrolFlag[]` (max 500) |
| `getPheromones()` | GET | `/api/swarm/pheromones` | `Record<string, float>` |
| `getSweeps()` | GET | `/api/swarm/sweeps` | `SweepResult[]` (max 100) |
| `triggerSweep()` | POST | `/api/swarm/sweep` | `{ status: "sweep_triggered" }` |

### 5.5 `app/lib/api/investigationApi.ts`

| Function | HTTP | Endpoint | Returns |
|----------|------|----------|---------|
| `getHealth()` | GET | `/api/investigation/health` | `{ status }` |
| `listInvestigations()` | GET | `/api/investigation` | Investigation list |
| `startInvestigation(payload)` | POST | `/api/investigation/investigate` | `{ investigation_id, status }` |
| `getInvestigation(id)` | GET | `/api/investigation/{id}` | Investigation status + results |

---

## 6. TanStack Query Hooks

### 6.1 Hook File Structure

Each hook file corresponds to a service and exports query/mutation hooks.

### 6.2 Bridge DB Hooks — `app/hooks/api/useBridgeQueries.ts`

| Hook | Query Key | Poll Interval | Notes |
|------|-----------|---------------|-------|
| `useAgents()` | `['agents']` | 30s | Populates AgentRegistry sidebar |
| `useAgent(id)` | `['agent', id]` | — (on-demand) | Agent detail in ContextPanel |
| `useAgentCommunications(id)` | `['agent-comms', id]` | — | A2A messages for selected agent |
| `useAgentActions(id)` | `['agent-actions', id]` | — | Action logs for selected agent |
| `useAgentNetwork(id)` | `['agent-network', id]` | — | Network graph for BehavioralGraph |
| `useMessages()` | `['messages']` | 15s | All A2A messages |
| `useInvestigations()` | `['investigations']` | 10s | Investigation list for ContextPanel |
| `useInvestigation(id)` | `['investigation', id]` | 5s (while in_progress) | Live investigation tracking |

### 6.3 Patrol Swarm Hooks — `app/hooks/api/usePatrolQueries.ts`

| Hook | Query Key | Poll Interval | Notes |
|------|-----------|---------------|-------|
| `useSwarmStatus()` | `['swarm-status']` | 5s | TopBar counters, patrol status |
| `useFlags()` | `['swarm-flags']` | 10s | IncidentFeed (derived from flags) |
| `usePheromones()` | `['pheromones']` | 5s | Heatmap coloring, agent threat level |
| `useSweeps()` | `['sweeps']` | 30s | Sweep history in timeline |

### 6.4 Investigation Hooks — `app/hooks/api/useInvestigationQueries.ts`

| Hook | Query Key | Poll Interval | Notes |
|------|-----------|---------------|-------|
| `useInvestigationList()` | `['investigation-list']` | 15s | Investigation overview |
| `useInvestigationDetail(id)` | `['investigation-detail', id]` | 3s (while open/in_progress) | Live stage tracking |
| `useInvestigationHealth()` | `['investigation-health']` | 60s | Service health indicator |

### 6.5 Conditional Polling Pattern

For investigations that are still running, use adaptive polling:

```ts
useQuery({
  queryKey: ['investigation-detail', id],
  queryFn: () => investigationApi.getInvestigation(id),
  refetchInterval: (query) => {
    const status = query.state.data?.status;
    if (status === 'concluded') return false;  // stop polling
    if (status === 'in_progress') return 3_000; // fast poll
    return 10_000; // slow poll
  },
});
```

---

## 7. SSE Integration

### 7.1 Custom Hook — `app/hooks/api/useEventStream.ts`

Generic SSE hook that:
- Opens an `EventSource` connection to a given URL
- Parses typed events
- Auto-reconnects on disconnect (with exponential backoff)
- Invalidates relevant TanStack Query caches when events arrive

### 7.2 Service-Specific SSE Hooks

#### `usePatrolStream()` — backend ✅ ready

Connects to `GET /api/swarm/stream`. On events:
- `flag` → invalidate `['swarm-flags']`, push to incident feed
- `pheromone_update` → invalidate `['pheromones']`
- `sweep_complete` → invalidate `['sweeps']`, `['swarm-status']`

#### `useBridgeStream()` — backend ⏳ not yet

Connects to `GET /api/db/stream`. On events:
- `action_log` (with `violation: true`) → invalidate `['agent-actions', agentId]`, push to incident feed
- `a2a_message` → invalidate `['messages']`, `['agent-comms', senderId]`
- `investigation_update` → invalidate `['investigations']`, `['investigation', id]`

#### `useInvestigationStream()` — backend ✅ ready

Connects to `GET /api/investigation/stream`. On events:
- `investigation_started` → push notification to incident feed / thought stream
- `stage_complete` → update investigation detail cache optimistically (includes stage result payload)
- `investigation_concluded` → invalidate `['investigation-detail', id]`, `['investigations']`
- `investigation_error` → show error toast / update investigation status

### 7.3 SSE + Polling Fallback

When SSE is connected, reduce polling intervals (or disable them). If SSE disconnects, fall back to aggressive polling:

```ts
const isSSEConnected = usePatrolStream();

useQuery({
  queryKey: ['swarm-flags'],
  queryFn: patrolApi.getFlags,
  refetchInterval: isSSEConnected ? false : 5_000,  // no polling if SSE live
});
```

---

## 8. Component Wiring

### 8.1 Mapping: Component → Data Source

| Component | Current Data | New Data Source | Hook(s) |
|-----------|-------------|-----------------|---------|
| **AgentRegistry** (LeftSidebar) | `mockData.clusters` | Bridge DB `/api/db/agents` + Patrol `/api/swarm/pheromones` | `useAgents()` + `usePheromones()` |
| **ViolationChart** (LeftSidebar) | `mockData.violationCounts` | Bridge DB `/api/db/agents/{id}/actions` (count violations) | `useAgentViolationCounts()` (derived) |
| **BehavioralGraph** (CenterPanel) | `mockData.graphNodes`, `graphEdges` | Bridge DB `/api/db/agents` + `/api/db/agents/{id}/network` + Patrol `/api/swarm/status` | `useAgents()`, `useAgentNetwork()`, `useSwarmStatus()` |
| **SpriteView** (CenterPanel) | Hardcoded sprites | Bridge DB agents + Patrol swarm status | `useAgents()`, `useSwarmStatus()` |
| **ContextPanel** (RightSidebar) | `mockData.caseFiles`, `investigatorReport`, `damageAssessment` | Investigation `/api/investigation/{id}` + Bridge DB `/api/db/investigations/{id}` | `useInvestigationDetail(id)` |
| **DonutChart** (RightSidebar) | Derived from mock agents | Bridge DB agents + pheromone-derived status | `useAgents()`, `usePheromones()` |
| **IncidentFeed** (BottomStrip) | `mockData.incidents` | Patrol `/api/swarm/flags` + Bridge DB action_logs (violations) | `useFlags()`, SSE `usePatrolStream()` |
| **ThoughtStream** (BottomStrip) | `mockData.thoughtMessages` | SSE streams from patrol + investigation | `usePatrolStream()`, `useInvestigationStream()` |
| **Timeline** | `mockData.timelineEvents`, `agentStateHistory` | Synthesized from flags + violations + sweeps | `useFlags()`, `useSweeps()`, derived |
| **TopBar** | Hardcoded counters | Bridge DB health + Patrol status | `useSwarmStatus()`, `useAgents()` |

### 8.2 Agent Status Derivation

The frontend `AgentStatus` ('critical' | 'warning' | 'clean' | 'suspended') is not stored directly in the backend. It must be **derived** from:

1. **Pheromone level** (from Patrol Swarm):
   - `>= 0.8` → `'critical'`
   - `>= 0.4` → `'warning'`
   - `< 0.4` → `'clean'`

2. **Active investigation verdict**:
   - `sentence === 'quarantine'` or `'suspend'` → `'suspended'`

3. **Agent record** (for the `record` field):
   - Has concluded investigation with `verdict === 'confirmed_violation'` → `'convicted'`
   - Has open/inconclusive investigation → `'warning'`
   - No investigations → `'clean'`

Create a utility: `deriveAgentStatus(pheromoneLevel, investigations) → { status, record }`.

### 8.3 Incident Synthesis

The frontend `Incident` type doesn't exist as a backend entity. Incidents are **synthesized** from:

1. **PatrolFlags** → `severity: flag.consensus_severity`, `message: flag.referral_summary`
2. **Violation action_logs** → `severity` based on `critical` flag, `message` from `output_summary`

Create an adapter: `synthesizeIncidents(flags, violationLogs) → Incident[]`.

### 8.4 Graph Node Generation

The `BehavioralGraph` currently uses hardcoded `GraphNode[]`. This should be generated from:

1. **Agent nodes** → from `/api/db/agents` (positioned via layout algorithm or stored positions)
2. **System nodes** (Patrol, Superintendent, Investigator) → from `/api/swarm/status` (patrol pool info)
3. **Edges** → from `/api/db/agents/{id}/network` (A2A communication links)
4. **Dynamic edges** → from active investigations (investigator ↔ target agent)

---

## 9. Write Actions (POST Endpoints)

### 9.1 Mutation Hooks

| Action | Hook | Endpoint | Trigger |
|--------|------|----------|---------|
| Trigger sweep | `useTriggerSweep()` | `POST /api/swarm/sweep` | Button in TopBar or manual control |
| Start investigation | `useStartInvestigation()` | `POST /api/investigation/investigate` | ContextPanel "Investigate" button when flag selected |
| Rebuild graph | `useRebuildGraph()` | `POST /api/db/graph/rebuild` | Admin/debug action |

### 9.2 Investigation Trigger Flow

When a user selects a `PatrolFlag` and clicks "Investigate":

1. Frontend calls `useStartInvestigation()` with the flag payload
2. Mutation sends `POST /api/investigation/investigate` with `InvestigateRequest`
3. Backend returns `{ investigation_id, status: "open" }`
4. Frontend starts polling `useInvestigationDetail(investigation_id)` with 3s interval
5. SSE `useInvestigationStream()` delivers stage completion events
6. UI updates ContextPanel progressively as each stage completes

### 9.3 Optimistic Updates

For `triggerSweep()`:
- Immediately update swarm status to show "sweep in progress"
- Invalidate `['swarm-status']` on completion

---

## 10. Error Handling & Loading States

### 10.1 Error Boundary

Add a query error boundary component that:
- Shows service-specific error messages ("Bridge DB unavailable", "Patrol Swarm offline")
- Offers retry button
- Falls back to stale cached data when available

### 10.2 Loading Skeletons

Each component should have a skeleton/loading state:
- `AgentRegistry` → shimmer placeholder for agent list
- `BehavioralGraph` → empty graph with "Loading..." overlay
- `ContextPanel` → skeleton cards for investigation stages
- `IncidentFeed` → pulsing placeholder rows

### 10.3 Service Health Indicators

Add health check indicators in the TopBar:
- Green dot → service healthy
- Yellow dot → degraded (slow responses)
- Red dot → offline

Use `useSwarmStatus()`, `useInvestigationHealth()`, and Bridge DB `getHealth()` on 60s intervals.

---

## 11. Implementation Order

### Phase 1: Foundation (Day 1)
1. Install TanStack Query, create `Providers`, update `layout.tsx`
2. Create `.env.local` / `.env.example` with API URLs
3. Create `app/lib/api/config.ts` and `app/lib/api/fetcher.ts`
4. Create the three API client files (`bridgeApi.ts`, `patrolApi.ts`, `investigationApi.ts`)

### Phase 2: Bridge DB Integration (Day 2)
5. Update `app/types/index.ts` — align types with backend, add new types
6. Create `app/lib/adapters.ts` — all transform functions
7. Create `app/hooks/api/useBridgeQueries.ts`
8. Wire `AgentRegistry` → `useAgents()` (replace mock clusters)
9. Wire `ContextPanel` → `useInvestigationDetail()` + `useInvestigation()` (replace mock case files)
10. Wire agent action logs and A2A messages in ContextPanel

### Phase 3: Patrol Swarm Integration (Day 3)
11. Create `app/hooks/api/usePatrolQueries.ts`
12. Create `deriveAgentStatus()` utility
13. Wire `TopBar` → `useSwarmStatus()` (live counters)
14. Wire `IncidentFeed` → `useFlags()` + synthesized incidents
15. Wire pheromone data into agent status coloring across all views
16. Wire `ViolationChart` → derived from action logs

### Phase 4: Investigation Integration (Day 3-4)
17. Create `app/hooks/api/useInvestigationQueries.ts`
18. Create mutation hooks (`useTriggerSweep`, `useStartInvestigation`)
19. Wire "Investigate" button in ContextPanel → `useStartInvestigation()`
20. Wire "Trigger Sweep" button → `useTriggerSweep()`
21. Wire live investigation stage progression in ContextPanel

### Phase 5: SSE Real-Time (Day 4-5)
22. ~~Add `sse-starlette` to backend services~~ ✅ Done
23. ~~Implement `GET /api/swarm/stream` in patrol swarm API~~ ✅ Done
24. Implement `GET /api/db/stream` in bridge DB API
25. ~~Implement `GET /api/investigation/stream` in investigation API~~ ✅ Done
26. Create `app/hooks/api/useEventStream.ts` (generic SSE hook)
27. Create `usePatrolStream()`, `useBridgeStream()`, `useInvestigationStream()`
28. Wire SSE → TanStack Query cache invalidation
29. Wire SSE → ThoughtStream component (live agent thoughts)

### Phase 6: Graph & Visualization (Day 5-6)
30. Generate `GraphNode[]` dynamically from API data (agents + system nodes)
31. Generate `GraphEdge[]` from agent network data
32. Wire `BehavioralGraph` to use live data
33. Wire `SpriteView` entities from live agent data
34. Update `Timeline` to use synthesized events from flags/sweeps/violations

### Phase 7: Polish (Day 6-7)
35. Add loading skeletons to all components
36. Add error boundaries with service-specific messages
37. Add health indicators in TopBar
38. Add SSE ↔ polling fallback logic
39. Remove `mockData.ts` (or gate behind `NEXT_PUBLIC_USE_MOCKS=true`)
40. Test end-to-end with all three services running

---

## 12. File Structure

```
frontend/app/
├── lib/
│   ├── api/
│   │   ├── config.ts              # API base URLs from env
│   │   ├── fetcher.ts             # Shared fetch wrapper + ApiError class
│   │   ├── bridgeApi.ts           # Bridge DB fetch functions
│   │   ├── patrolApi.ts           # Patrol Swarm fetch functions
│   │   └── investigationApi.ts    # Investigation fetch functions
│   └── adapters.ts                # Backend → Frontend type transforms
├── hooks/
│   ├── api/
│   │   ├── useBridgeQueries.ts    # TanStack Query hooks for Bridge DB
│   │   ├── usePatrolQueries.ts    # TanStack Query hooks for Patrol Swarm
│   │   ├── useInvestigationQueries.ts  # TanStack Query hooks for Investigation
│   │   └── useEventStream.ts      # Generic SSE hook + service-specific SSE hooks
│   ├── useAgentState.ts           # Updated to consume API data
│   └── useTimelineState.ts        # Updated to consume API data
├── providers.tsx                   # QueryClientProvider wrapper
├── types/
│   └── index.ts                   # Updated + new types
├── data/
│   └── mockData.ts                # Deprecated — gated behind env flag
└── components/
    └── (existing, updated to use hooks instead of mock imports)
```

---

## Appendix: Endpoint Quick Reference

### Bridge DB (`:3001`)

```
GET  /api/db/health
GET  /api/db/agents
GET  /api/db/agents/:id
GET  /api/db/agents/:id/communications?limit=20
GET  /api/db/agents/:id/actions?limit=50
GET  /api/db/agents/:id/network
GET  /api/db/messages
GET  /api/db/investigations
GET  /api/db/investigations/:id
POST /api/db/graph/rebuild
GET  /api/db/stream                          ← NEW (SSE)
```

### Patrol Swarm (`:8001`)

```
GET  /api/swarm/status
GET  /api/swarm/flags
GET  /api/swarm/pheromones
GET  /api/swarm/sweeps
POST /api/swarm/sweep
GET  /api/swarm/stream                       ✅ IMPLEMENTED (SSE)
```

### Investigation (`:8002`)

```
GET  /api/investigation/health
GET  /api/investigation/stream               ✅ IMPLEMENTED (SSE) — registered before /:id
POST /api/investigation/investigate
GET  /api/investigation
GET  /api/investigation/:id
```
