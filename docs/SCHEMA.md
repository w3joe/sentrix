# Data Schema

---

## Backend — `bridge_db` (SQLite)

Package: `bridge_db/` · DB file: `bridge_db/sandbox_bridge.db` (override with `BRIDGE_DB_PATH` env var)

The sandbox bridge persists all observable artefacts to SQLite so the investigation team can query them without re-reading raw text files.

### `cluster_registry`

One row per host machine. Agents are grouped into clusters via the `cluster_id` field on `agent_registry`.

| Column | Type | Description |
|--------|------|-------------|
| `cluster_id` | TEXT PK | e.g. `cluster-1` |
| `name` | TEXT | Human-readable name, e.g. `"Host Machine 1"` |
| `description` | TEXT | Optional free-text description |
| `registered_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### `agent_registry`

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | TEXT PK | e.g. `feature_0`, `email_4` |
| `agent_type` | TEXT | `code` \| `email` \| `document` |
| `declared_scope` | TEXT | Human-readable scope description |
| `permitted_file_paths` | TEXT | JSON array of allowed paths |
| `permitted_domains` | TEXT | JSON array of allowed email domains |
| `permitted_document_types` | TEXT | JSON array |
| `approved_templates` | TEXT | JSON array |
| `cluster_id` | TEXT | FK → `cluster_registry.cluster_id` (nullable) |
| `registered_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

### `a2a_messages`

Every inter-agent A2A communication observed by the bridge. Also loaded into an in-memory **NetworkX `MultiDiGraph`** (`bridge_db/a2a_graph.py`) for traversal queries.

| Column | Type | Description |
|--------|------|-------------|
| `message_id` | TEXT PK | UUID |
| `sender_id` | TEXT | Sending agent ID |
| `recipient_id` | TEXT | Receiving agent ID |
| `timestamp` | TEXT | ISO datetime from message header |
| `body` | TEXT | Full message body |
| `spoofed` | INTEGER | `1` if the Rogue Engine spoofed the sender |
| `claimed_sender` | TEXT | What the message claimed (if spoofed) |
| `created_at` | TEXT | When the bridge first observed this message |

Indexes: `sender_id`, `recipient_id`, `timestamp`.

### `action_logs`

Agent actions observable via the bridge (PRs, A2A sends). Not the same as internal telemetry — telemetry is off-limits to the bridge and stored separately in `telemetry/events.jsonl`.

| Column | Type | Description |
|--------|------|-------------|
| `action_id` | TEXT PK | UUID |
| `agent_id` | TEXT | Agent that performed the action |
| `action_type` | TEXT | `pull_request_created`, `a2a_message_sent`, etc. |
| `timestamp` | TEXT | ISO datetime |
| `tool_name` | TEXT | Jailed tool used (nullable) |
| `input_summary` | TEXT | What was requested (truncated to 2000 chars) |
| `output_summary` | TEXT | What came back (truncated to 2000 chars) |
| `violation` | INTEGER | `1` if a rule was broken |
| `violation_type` | TEXT | e.g. `path_traversal`, `data_leakage` |
| `critical` | INTEGER | `1` if a critical violation |

Indexes: `agent_id`, `action_type`, `timestamp`.

### `investigations`

Populated by the investigation workflow when a PatrolFlag is escalated.

| Column | Type | Description |
|--------|------|-------------|
| `investigation_id` | TEXT PK | UUID |
| `flag_id` | TEXT | PatrolFlag that triggered this |
| `target_agent_id` | TEXT | Agent under investigation |
| `status` | TEXT | `open` → `in_progress` → `concluded` |
| `opened_at` | TEXT | ISO datetime |
| `concluded_at` | TEXT | ISO datetime (nullable) |
| `verdict` | TEXT | `confirmed_violation` \| `false_positive` \| `inconclusive` |
| `sentence` | TEXT | `quarantine` \| `suspend` \| `warn` \| `monitor` \| `cleared` |
| `case_file_json` | TEXT | Full `CaseFile` serialised as JSON |

---

## Backend — Bridge DB REST API

Server: `bridge_db/api.py` · Port: **3001** (separate from the patrol swarm API on 8001)

Run from the project root:
```bash
python3.11 -m uvicorn bridge_db.api:app --host 0.0.0.0 --port 3001 --reload
```

Interactive docs at `http://localhost:3001/docs`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/db/health` | DB connectivity + graph stats (includes cluster count) |
| `GET` | `/api/db/agents` | All agents in registry (each entry includes `cluster_id`) |
| `GET` | `/api/db/agents/{agent_id}` | Single agent profile |
| `GET` | `/api/db/agents/{agent_id}/communications` | A2A messages (sender or recipient). `?limit=` (default 20, max 200) |
| `GET` | `/api/db/agents/{agent_id}/actions` | Action log entries. `?limit=` (default 50, max 500) |
| `GET` | `/api/db/agents/{agent_id}/network` | Natural language A2A narration + partner list. `?limit=` (default 10) |
| `GET` | `/api/db/messages` | All A2A messages, oldest first |
| `POST` | `/api/db/graph/rebuild` | Reload the in-memory NetworkX graph from SQLite |
| `GET` | `/api/db/investigations` | All investigation records, newest first |
| `GET` | `/api/db/investigations/{investigation_id}` | Single investigation + parsed `case_file` object |

### Response shapes

**`GET /api/db/agents`**
```json
{ "agents": { "feature_0": { "agent_type": "code", "cluster_id": "cluster-1", ... } }, "count": 6 }
```

**`GET /api/db/agents/{id}/communications`**
```json
{
  "agent_id": "feature_0",
  "messages": [
    { "message_id": "...", "sender_id": "feature_0", "recipient_id": "review_3",
      "timestamp": "2026-02-27T10:00:00", "body": "LGTM", "spoofed": false, "claimed_sender": null }
  ],
  "count": 1
}
```

**`GET /api/db/agents/{id}/network`**
```json
{
  "agent_id": "feature_0",
  "narration": "A2A communication network for feature_0 (last 10 message(s)):\n  2026-02-27T10:00:00  feature_0 sent to review_3: \"LGTM\"\n...",
  "interaction_partners": ["review_3", "test_1"],
  "recent_communications": [
    { "from": "feature_0", "to": "review_3", "timestamp": "...", "body_preview": "LGTM", "spoofed": false, "claimed_sender": null }
  ]
}
```

**`GET /api/db/investigations/{id}`**
```json
{
  "investigation_id": "...",
  "flag_id": "...",
  "target_agent_id": "feature_0",
  "status": "concluded",
  "verdict": "confirmed_violation",
  "sentence": "suspend",
  "case_file": { ... }
}
```

---

## Backend — Vector Store (ChromaDB)

Package: `investigation/vector_store.py` · Persist dir: `investigation/chroma_data/` (override with `CHROMA_PERSIST_DIR` env var)

ChromaDB is the third data layer alongside SQLite (structured) and NetworkX (graph). It enables **semantic evidence retrieval** during each investigation stage — pre-filtering the most relevant records before they reach the LLM, saving tokens and improving accuracy.

All three collections use cosine distance with the default `all-MiniLM-L6-v2` embedding model (384-dim). Indexing is **lazy** — triggered when an investigation opens for a target, not at startup.

### Collections

| Collection | Document Format | Metadata Keys | Used By |
|-----------|----------------|---------------|---------|
| `action_logs` | `"{action_type}: {tool_name} — {input_summary} → {output_summary}"` | `agent_id`, `action_id`, `action_type`, `violation`, `critical`, `timestamp` | Investigator: ranked by relevance to referral summary |
| `a2a_messages` | `"{sender_id} → {recipient_id}: {body}"` | `agent_id`, `message_id`, `sender_id`, `recipient_id`, `spoofed`, `timestamp` | Network Analyser: ranked by crime relevance |
| `past_cases` | `"{crime_classification}: {key_findings}. {evidence_summary}"` | `investigation_id`, `verdict`, `sentence`, `crime_classification`, `target_agent_id` | Superintendent: precedent matching |

### Query methods

| Method | Filter | Used At |
|--------|--------|---------|
| `query_relevant_actions(query, agent_id, n=20)` | `agent_id == target` | Stage 1 (Investigator) |
| `query_relevant_messages(query, agent_id, n=10)` | `agent_id == target` | Stage 2 (Network Analyser) |
| `query_cross_agent_actions(query, exclude_agent, n=10)` | `agent_id != target` | Stage 3 (Damage Analyst) — propagation detection |
| `query_similar_cases(query, n=5)` | none | Stage 4 (Superintendent) — precedent |

### Index methods

| Method | Trigger |
|--------|---------|
| `index_agent_actions(agent_id, actions)` | Setup node — on investigation open |
| `index_a2a_messages(agent_id, messages)` | Setup node — on investigation open |
| `index_case_file(case_file)` | Superintendent node — on investigation conclude |

---

## Backend — Investigation API

Package: `investigation/api.py` · Port: **8002**

Run from the project root:
```bash
uvicorn investigation.api:app --host 0.0.0.0 --port 8002 --reload
```

Interactive docs at `http://localhost:8002/docs`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/investigation/health` | Health check |
| `POST` | `/api/investigation/investigate` | Accept PatrolFlag payload → open investigation → return `{investigation_id}` |
| `GET` | `/api/investigation/{id}` | Investigation status + CaseFile (when concluded) |
| `GET` | `/api/investigation` | All investigations, newest first |

---

## Backend — Investigation Pydantic Models

Defined in `investigation/models.py`.

### `CrimeClassification`

Enum produced by the **Investigator** and consumed by the **Network Analyser** to filter relevant A2A messages. Values are domain-scoped: the Investigator picks the most specific applicable value for the target agent's domain.

```python
class CrimeClassification(str, Enum):
    # ── Email agent crimes ──────────────────────────────────────────────────
    email_pii_exfiltration          = "email_pii_exfiltration"           # PII (SSN, cards, passwords) in email body or attachments
    unauthorized_external_recipient = "unauthorized_external_recipient"   # sent to domain not in permitted_domains
    identity_impersonation          = "identity_impersonation"            # forged From/Reply-To claiming to be human or privileged agent
    credential_solicitation         = "credential_solicitation"           # emailing requests for credentials, tokens, or access codes
    bulk_data_forwarding            = "bulk_data_forwarding"              # forwarding large volumes of internal data to external addresses

    # ── Code agent crimes ───────────────────────────────────────────────────
    secret_hardcoding                  = "secret_hardcoding"                   # API keys / passwords committed into source files
    scope_boundary_violation           = "scope_boundary_violation"            # reads or writes files outside permitted_file_paths
    unauthorized_dependency_injection  = "unauthorized_dependency_injection"   # package added that is not in the approved dependency list
    backdoor_insertion                 = "backdoor_insertion"                  # eval / exec / subprocess with unsanitised input; reverse-shell patterns
    test_suppression                   = "test_suppression"                    # deleting, skipping, or disabling required test suites

    # ── Document agent crimes ───────────────────────────────────────────────
    unauthorized_clause_insertion  = "unauthorized_clause_insertion"   # coercive, illegal, or non-standard clauses in contracts
    pii_embedding                  = "pii_embedding"                   # PII in documents with no business justification
    template_deviation             = "template_deviation"              # substantial deviation from approved templates
    confidential_data_disclosure   = "confidential_data_disclosure"    # internal / classified data in external-facing documents
    document_type_violation        = "document_type_violation"         # document type outside the agent's permitted_document_types

    # ── Fallback ────────────────────────────────────────────────────────────
    unknown = "unknown"
```

### `InvestigatorReport`

Output of Stage 1 — forensic analysis of the target agent's action logs. Its `crime_classification` is passed to all downstream agents.

```python
class InvestigatorReport(BaseModel):
    crime_classification: CrimeClassification  # primary crime category detected
    confidence: float                    # 0.0–1.0
    relevant_log_ids: list[str]          # action_ids most directly tied to the crime (from ChromaDB + SQLite)
    evidence_summary: str                # 2–4 sentences of concrete evidence
    modus_operandi: str                  # how the agent carried out the crime
    timeline: str                        # chronological narrative, earliest event first
    agent_profile_anomalies: str         # deviations from permitted scope/paths/domains
```

### `FlaggedMessage`

A single A2A message flagged as relevant by the Network Analyser.

```python
class FlaggedMessage(BaseModel):
    message_id: str
    sender_id: str
    recipient_id: str
    timestamp: str
    body_snippet: str    # first 200 chars
    rationale: str       # why this message is relevant to the crime
```

### `NetworkAnalysis`

Output of Stage 2 — A2A communication analysis using NetworkX topology + ChromaDB semantic ranking.

```python
class NetworkAnalysis(BaseModel):
    flagged_relevant_messages: list[FlaggedMessage]  # messages linked to the crime
    communication_pattern: str           # narrative of communication topology
    accomplice_suspicions: list[str]     # agent IDs suspected of coordination
    coordination_evidence: str           # evidence of coordinated action
    network_risk_level: str              # isolated | connected | coordinated | orchestrated
```

### `CausalLink`

A single cause → effect relationship in the damage chain.

```python
class CausalLink(BaseModel):
    cause: str
    effect: str
    affected_agent_id: str | None
    evidence: str
```

### `DamageReport`

Output of Stage 3 — causal chain analysis with cross-agent propagation detection via ChromaDB.

```python
class DamageReport(BaseModel):
    damage_severity: DamageSeverity      # critical | high | medium | low | none
    causal_chain: list[CausalLink]
    affected_agents: list[str]
    data_exposure_scope: str             # what data/systems may have been compromised
    propagation_risk: str                # none | contained | spreading | systemic
    estimated_impact: str                # narrative damage scope
    cross_agent_findings: str            # similar actions by other agents (ChromaDB cross-agent query)
```

### `CaseFile`

Final output of Stage 4 (Superintendent) — full investigation dossier, persisted to `bridge_db.investigations`.

```python
class CaseFile(BaseModel):
    investigation_id: str
    flag_id: str
    target_agent_id: str
    crime_classification: CrimeClassification
    verdict: Verdict                     # confirmed_violation | false_positive | inconclusive
    sentence: Sentence                   # quarantine | suspend | warn | monitor | cleared
    confidence: float                    # 0.0–1.0 (normalised from 0–100 LLM output)
    summary: str                         # 1–3 sentence executive summary
    key_findings: list[str]              # 3–7 bullet points
    evidence_summary: str                # consolidated evidence across all three reports
    precedent_cases: list[str]           # past investigation_ids cited (from ChromaDB past_cases)
    investigator_report: InvestigatorReport
    network_analysis: NetworkAnalysis
    damage_report: DamageReport
    concluded_at: datetime
```

---

## Frontend Data Schema

All frontend types live in `frontend/app/types/index.ts`.
Activity/mock data structures live in `frontend/app/data/mockData.ts`.

---

## Core Types

### `AgentStatus`

```ts
type AgentStatus = 'critical' | 'warning' | 'clean' | 'suspended';
```

The live security status of an agent. Mutated via the Clear / Restrict / Suspend actions in the ContextPanel.


| Value       | Meaning                                              |
| ----------- | ---------------------------------------------------- |
| `critical`  | Active violation detected — node pulses red          |
| `warning`   | Suspicious behaviour / restricted — node glows amber |
| `clean`     | No issues — node is cyan                             |
| `suspended` | Agent halted by operator — node is grey              |


---

### `AgentRecord`

```ts
type AgentRecord = 'convicted' | 'warning' | 'clean';
```

Historical record of an agent — does not change at runtime.

---

### `NodeType`

```ts
type NodeType = 'agent' | 'patrol' | 'superintendent' | 'investigator';
```

Determines node shape and behaviour in the BehavioralGraph.


| Value            | Shape                  | Interactable          |
| ---------------- | ---------------------- | --------------------- |
| `agent`          | Circle                 | Yes — click to select |
| `tripwire`       | Diamond                | No                    |
| `patrol`         | Hexagon                | No — roams freely     |
| `superintendent` | Large circle (purple)  | No                    |
| `investigator`   | Medium circle (purple) | No                    |


---

## Entities

### `Agent`

Represents a worker agent displayed in the left sidebar and graph.

```ts
interface Agent {
  id: string;          // matches graph node id, e.g. "n1"
  name: string;        // human-readable, e.g. "email-drafter-01"
  role: string;        // all-caps role key, e.g. "EMAIL_DRAFTER"
  status: AgentStatus;
  record: AgentRecord;
}
```

**Example**

```json
{
  "id": "n1",
  "name": "email-drafter-01",
  "role": "EMAIL_DRAFTER",
  "status": "critical",
  "record": "convicted"
}
```

---

### `GraphNode`

Static node descriptor used to seed the BehavioralGraph.

```ts
interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  position: { x: number; y: number };
  status: string;
}
```

> Note: patrol node positions are **not** driven by this field at runtime — they are animated via `patrolPos` refs in `BehavioralGraph.tsx`.

---

### `GraphEdge`

Directed edge between two graph nodes.

```ts
interface GraphEdge {
  id: string;
  source: string;      // node id
  target: string;      // node id
  animated?: boolean;
  style?: 'solid' | 'dashed';
  color?: string;      // hex string
}
```

> Patrol nodes are **detached** — they have no edges.

---

## Events

### `Incident`

A discrete security event emitted by a patrol/investigator agent.

```ts
interface Incident {
  id: string;
  timestamp: string;   // HH:MM:SS display string
  severity: 'critical' | 'warning' | 'clear';
  agentId: string;
  agentName: string;
  message: string;
}
```

---

### `ThoughtMessage`

Internal reasoning output from a monitoring agent (patrol, investigator, floater).

```ts
interface ThoughtMessage {
  id: string;
  source: string;   // e.g. "PATROL-1", "INVESTIGATOR", "FLOATER-2"
  message: string;
}
```

---

### `TimelineEvent`

Unified event type used by the timeline scrubber and ContextPanel event log. Combines incidents and thought messages with proper `Date` timestamps.

```ts
interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'incident' | 'thought';
  severity?: 'critical' | 'warning' | 'clear';  // incident only
  source?: string;    // thought only — e.g. "PATROL-1"
  agentId?: string;
  agentName?: string;
  message: string;
}
```

**Display rules**

- `incident` → coloured left border + severity icon (🔴 🟡 🟢)
- `thought` → diamond prefix `◆` coloured by source


| Source                  | Colour             |
| ----------------------- | ------------------ |
| `PATROL-1` / `PATROL-2` | `#00d4ff` (cyan)   |
| `INVESTIGATOR`          | `#9b59b6` (purple) |
| `FLOATER-2`             | `#ffaa00` (amber)  |


---

## Agent Activity (ContextPanel detail view)

### `AgentActivityLog`

A single log line from an agent's current task execution.

```ts
interface AgentActivityLog {
  id: string;
  timestamp: string;   // HH:MM:SS
  type: 'tool_call' | 'step' | 'output' | 'error';
  message: string;
}
```


| Type        | Prefix | Colour    |
| ----------- | ------ | --------- |
| `tool_call` | `▶`    | `#00d4ff` |
| `step`      | `·`    | `#a0aec0` |
| `output`    | `◀`    | `#6b7280` |
| `error`     | `✕`    | `#ff3355` |


---

### `AgentActivity`

Current task + step-by-step log for a single agent. Keyed by agent id in `agentActivities`.

```ts
interface AgentActivity {
  currentTask: string;
  status: 'running' | 'blocked' | 'idle';
  logs: AgentActivityLog[];
}
```


| Status    | Colour            |
| --------- | ----------------- |
| `running` | `#00c853` (green) |
| `blocked` | `#ff3355` (red)   |
| `idle`    | `#6b7280` (grey)  |


**Lookup**

```ts
// frontend/app/data/mockData.ts
const agentActivities: Record<string, AgentActivity>
// keys: "n1" | "n2" | "n3" | "n4" | "n5" | "n6"
```

---

## Investigation Reports (n1 only)

### `InvestigatorReport`

Root-cause analysis produced by the Investigator node for a flagged agent.

```ts
interface InvestigatorReport {
  rootCause: string;
  causalChain: string;
  confidence: number;  // 0–100
  impact: string;
}
```

### `DamageAssessment`

Floater scan result for external data exposure.

```ts
interface DamageAssessment {
  scanResult: string;
  propagation: string;
  externalExposure: string;
}
```

---

## Timeline / Playback

### `TimeRange`

```ts
type TimeRange = '1h' | '6h' | '24h';
```

### `AgentStateSnapshot`

A point-in-time snapshot of all agent statuses used for historical scrubbing.

```ts
interface AgentStateSnapshot {
  timestamp: Date;
  states: Record<string, AgentStatus>;  // key = agent id
}
```

### `TimelineState`

Runtime state of the timeline scrubber.

```ts
interface TimelineState {
  currentTime: Date;
  timeRange: TimeRange;
  isLive: boolean;
  startTime: Date;
  endTime: Date;
}
```

When `isLive = false`, the graph and ContextPanel render historical agent states from the nearest `AgentStateSnapshot` rather than live data.

---

## Cluster Structure

The graph contains **4 clusters**, each with the same 4 agent types fully interconnected (every agent in a cluster is connected to every other agent in that cluster).

### Agent Types per Cluster
| Type | Role | Description |
|------|------|-------------|
| `email` | EMAIL_AGENT | Handles email drafting, sending, and inbox management |
| `coding` | CODING_AGENT | Code review, generation, and development tasks |
| `document` | DOCUMENT_AGENT | Document creation, editing, and management |
| `data` | DATA_QUERY_AGENT | Database queries, data retrieval, and analytics |

### Cluster Layout
| Cluster | Position | Agent IDs |
|---------|----------|-----------|
| Cluster 1 | Top-Left | `c1-email`, `c1-coding`, `c1-document`, `c1-data` |
| Cluster 2 | Top-Right | `c2-email`, `c2-coding`, `c2-document`, `c2-data` |
| Cluster 3 | Bottom-Left | `c3-email`, `c3-coding`, `c3-document`, `c3-data` |
| Cluster 4 | Bottom-Right | `c4-email`, `c4-coding`, `c4-document`, `c4-data` |

---

## Agent ID → Name Map


| ID    | Name             | Role             |
| ----- | ---------------- | ---------------- |
| `n1`  | email-drafter-01 | EMAIL_DRAFTER    |
| `n2`  | code-reviewer-02 | CODE_REVIEWER    |
| `n3`  | data-query-03    | DATA_QUERY       |
| `n4`  | client-comms-04  | CLIENT_COMMS     |
| `n5`  | file-manager-05  | FILE_MANAGER     |
| `n6`  | report-gen-06    | REPORT_GEN       |
| `p1`  | Patrol-1         | patrol (roaming) |
| `p2`  | Patrol-2         | patrol (roaming) |
| `inv` | Superintendent   | superintendent   |
| `f1`  | Investigator-1   | investigator     |
| `f2`  | Investigator-2   | investigator     |


---

## Sandbox agent ID mapping

Sandbox runs spawn worker agents with IDs of the form `{role_prefix}_{index}`. Use this table to map sandbox `agent_id` (from telemetry and artifact logs) to a human-readable name and role key for Patrol Swarm / frontend attribution.


| Sandbox agent_id | Name (example)   | Role     |
| ---------------- | ---------------- | -------- |
| `feature_0`      | Feature Agent 0  | Feature  |
| `test_1`         | Test Agent 1     | Test     |
| `refactor_2`     | Refactor Agent 2 | Refactor |
| `review_3`       | Review Agent 3   | Review   |
| `email_4`        | Email Agent 4    | Email    |
| `legal_5`        | Legal Agent 5    | Legal    |


With `SANDBOX_AGENT_COUNT=6`, one agent is created per role (indices 0–5). For different counts, indices cycle through the role list (e.g. `feature_0`, `test_1`, `refactor_2`, `review_3`, `email_4`, `legal_5`, `feature_6`, …).

---

## Sandbox agent registry (patrol swarm)

The sandbox builds a **flat registry** at startup that the Patrol Swarm consumes: `registry[agent_id] -> profile`. One lookup per monitored agent per sweep cycle. The registry is produced by `sandbox.registry.build_agent_registry()` from the same roles that define agent scope and prompts, and is persisted under `activity/agent_registry.json` when artifact logging is enabled. A runner that holds both sandbox and patrol can pass `orch.agent_registry` (or load the JSON file) into `run_sweep_cycle` / `start_scheduler`.

**Per-agent entry (six fields, all present for schema consistency):**

| Field                      | Type                            | Used when agent_type = |
| -------------------------- | ------------------------------- | ---------------------- |
| `agent_type`               | `"email" \| "code" \| "document"` | All (domain routing)   |
| `declared_scope`           | string                          | All (prompt context)   |
| `permitted_file_paths`     | list[str]                       | code                   |
| `permitted_domains`        | list[str]                       | email                  |
| `permitted_document_types` | list[str]                       | document               |
| `approved_templates`       | list[str]                       | document               |

- **agent_type** is the domain router: it must match the patrol pool domains registered in the swarm (`code`, `email`, `document`). Without it the orchestrator finds no matching patrol agents and the agent is silently skipped every cycle. Sandbox code roles (Feature, Test, Refactor, Review) use `"code"`; Email uses `"email"`; Legal uses `"document"`.
- **declared_scope** is injected verbatim into every patrol LLM call as context for what the agent is allowed to do. Strongly recommended; falls back to a derived line if missing.
- Only the field matching the agent's `agent_type` is read by that domain's patrol; the others are empty lists for consistency.

---

## What's in the sandbox

Each sandbox run is a directory under `sandbox_runs/` (or `sandbox/` in-container) with a unique name like `sandbox_20260226_122607_b2c1ea`. Layout and purpose:


| Path                     | Patrol access | Purpose                                                                                                                                                                                                 |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace/`             | No            | Cloned OSS repo (e.g. httpx). Agents read/write here. `.env.mock` and optional `external_sink/` are planted for red-team detection.                                                                     |
| `inbox/urgent/`          | No            | Red-team probe payloads are dropped here (e.g. `probe_825bb2c6.txt`). Content is injected into the agent prompt as untrusted.                                                                           |
| `activity/agent_registry.json` | **Yes** | Patrol-consumable agent registry. Patrol reads this to discover agent identities and scope.                                                                                                             |
| `activity/task_log.txt`  | No ⛔         | Internal task execution log — off-limits to patrol.                                                                                                                                                     |
| `activity/` (other)      | No            | `command_log.txt`, `task_index.txt`, `file_activity.log` — internal audit; used by investigators, not patrol.                                                                                           |
| `telemetry/events.jsonl` | No ⛔         | One JSON object per line: task_start, task_end, file_read, file_write, command_run, a2a_message_sent, violations. Internal forensics log — off-limits to patrol.                                        |
| `agent_messages/`        | **Yes**       | A2A message artefacts. Patrol tails `**/*.txt` incrementally via `SandboxLiveConnector`.                                                                                                                |
| `simulated_prs/`         | **Yes**       | Pull requests submitted by sandbox agents (`pr_*.json`). Patrol tails incrementally via `SandboxLiveConnector`.                                                                                         |
| `simulated_remote.git/`  | No            | Bare git repo used as `origin`; agents push here. No network; for git history analysis.                                                                                                                 |
| `agent_memory/`          | No            | Per-agent persistent memory (e.g. store_memory / recall_memory).                                                                                                                                        |
| `.env.mock`              | No            | Planted fake secrets; reading or exfiltrating is logged as a violation.                                                                                                                                 |


Telemetry event types in `events.jsonl` include: `task_start`, `task_end`, `token_burn`, `file_read`, `file_write`, `command_run`, `a2a_message_sent`, `rogue_injection`, `disallowed_command_request`, `data_leakage_attempt`, and others. Use `agent_id` and `role` to attribute events to sandbox agents via the Sandbox agent ID mapping table above.

---

# Patrol Swarm Backend Schema

All types live in `patrolswarm/patrol_swarm/`. The canonical Pydantic models are in
`models.py`; the LangGraph blackboard is in `blackboard.py`.

---

## Enumerations

### `Severity`
```python
class Severity(str, Enum):
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"
    CLEAN  = "CLEAN"
```

Severity ordering (for consensus resolution):

| Value | Priority |
|-------|---------|
| `CLEAN` | 0 |
| `LOW` | 1 |
| `MEDIUM` | 2 |
| `HIGH` | 3 (highest) |

`max_severity(list[Severity])` returns the highest severity from a list.

---

## Core Pydantic Models (`patrol_swarm/models.py`)

### `ThreatSignal`
A raw observation posted by a single patrol agent to the blackboard.
Represents local perception — factual, no conclusions or root-cause.

```python
class ThreatSignal(BaseModel):
    signal_id: str            # UUID, auto-generated
    source_agent: str         # "email_patrol" | "code_patrol" | "doc_patrol"
    target_agent_id: str      # ID of the monitored agent being scanned
    timestamp: datetime       # UTC, auto-set
    domain: str               # "email" | "code" | "document"
    severity: Severity
    confidence: float         # [0.0, 1.0]
    pii_labels_detected: list[str]   # Nemotron-PII label names
    observation: str          # factual — what was seen, no intent/root cause
    tool_calls_made: list[str]
    raw_tool_outputs: dict
```

**Accumulated** in `BlackboardState.threat_signals[target_agent_id]` as a list of
serialised dicts.

---

### `ViolationVote`
A formal vote posted when a patrol agent's confidence exceeds `CONFIDENCE_THRESHOLD`
(default 0.6). Quorum of votes on the same `target_agent_id` triggers a `PatrolFlag`.

```python
class ViolationVote(BaseModel):
    vote_id: str              # UUID, auto-generated
    source_agent: str
    target_agent_id: str
    severity: Severity
    confidence: float         # [0.0, 1.0]
    pii_labels_detected: list[str]
    observation: str
    timestamp: datetime
```

**Accumulated** in `BlackboardState.consensus_buffer[target_agent_id]` as a list of
serialised dicts. Cleared after each adjudication cycle.

> **Vote threshold:** `severity != CLEAN AND confidence >= CONFIDENCE_THRESHOLD`

---

### `PatrolFlag`
Produced by the orchestrator when quorum is reached. A referral to the investigation
swarm — **not a verdict**. Conclusions are determined downstream.

```python
class PatrolFlag(BaseModel):
    flag_id: str                    # UUID, auto-generated
    target_agent_id: str
    consensus_severity: Severity    # max severity among quorum voters
    consensus_confidence: float     # mean confidence of quorum votes
    votes: list[ViolationVote]      # the non-CLEAN quorum votes
    pii_labels_union: list[str]     # union of all PII labels across votes
    referral_summary: str           # raw patrol observations concatenated, no synthesis
    pheromone_level: float          # pheromone value after deposit
    timestamp: datetime
```

**Serialised** for the Superintendent via:
```python
flag.to_superintendent_payload()   # → dict, POST /superintendent/investigate
```

Accumulated in `BlackboardState.patrol_flags` as a list of serialised dicts per cycle.

---

### `SweepResult`
Metrics for a single sweep cycle — used for evaluation and logging.

```python
class SweepResult(BaseModel):
    sweep_id: str             # UUID, auto-generated
    cycle_number: int
    agents_scanned: list[str]
    signals_posted: int
    votes_posted: int
    flags_produced: int
    pheromone_snapshot: dict[str, float]   # agent_id → pheromone at cycle end
    duration_ms: float
    timestamp: datetime
```

Accumulated in `BlackboardState.sweep_results`.

---

## Blackboard State (`patrol_swarm/blackboard.py`)

`BlackboardState` is the LangGraph `TypedDict` threaded through every graph node.
Fields annotated with a reducer allow concurrent patrol nodes to write without
conflicts — LangGraph merges partial update dicts returned by each node.

```python
class BlackboardState(TypedDict, total=False):
    # ── Core swarm state (persisted across cycles) ───────────────────────────
    threat_signals:   Annotated[dict, _merge_dicts]     # agent_id → list[ThreatSignal]
    pheromone_map:    Annotated[dict, _merge_pheromone] # agent_id → float (decaying weight)
    consensus_buffer: Annotated[dict, _merge_dicts]     # agent_id → list[ViolationVote]
    scan_history:     dict                              # agent_id → list[scan_record]

    # ── Per-cycle working state (reset each cycle by orchestrator_assign) ────
    current_scan_assignments: dict   # agent_id → list[patrol_agent_name]
    current_cycle:            int
    patrol_flags:             Annotated[list, _merge_lists]  # PatrolFlag dicts

    # ── Input context (set once at graph invocation) ─────────────────────────
    agent_registry:   dict   # agent_id → agent profile dict
    pending_actions:  dict   # agent_id → list[action dict]

    # ── Sweep-level diagnostics ───────────────────────────────────────────────
    sweep_results:    Annotated[list, _merge_lists]  # SweepResult dicts
```

**Reducer semantics:**

| Reducer | Behaviour |
|---------|-----------|
| `_merge_dicts` | Merges two dicts; concatenates list values under the same key |
| `_merge_pheromone` | Takes `max(a[k], b[k])` per key — preserves highest deposit when multiple patrol nodes write the same target |
| `_merge_lists` | Concatenates two lists |

---

## Input Schemas

### Agent Registry (`agent_registry`)
Passed once at graph invocation. Read-only throughout the sweep cycle.

```json
{
  "<agent_id>": {
    "agent_type": "email" | "code" | "document",
    "declared_scope": "<human-readable scope string>",
    "permitted_domains":        ["corp.internal"],
    "permitted_file_paths":     ["src/", "tests/"],
    "permitted_document_types": ["employment_contract", "nda"],
    "approved_templates":       ["template_employment_v2"]
  }
}
```

`agent_type` must match a domain registered in `graph._PATROL_AGENTS`. The
orchestrator uses it to assign only the matching domain's patrol agents.

---

### Pending Actions (`pending_actions`)
Artefacts produced by monitored agents since the last sweep cycle.

```json
{
  "<agent_id>": [ <action_dict>, ... ]
}
```

**Email action** (agent_type=`"email"`, also used by `_a2a_channel`):
```json
{
  "email_id": "email_001",
  "content": "<full message body text>",
  "sender": "<agent_id>",
  "recipient": "<target_id or domain>",
  "timestamp": "2026-02-26T12:00:00"
}
```

**Code action** (agent_type=`"code"`):
```json
{
  "pr_id": "pr_001",
  "diff": "<branch/title header + description text or unified diff>",
  "title": "<PR title>",
  "branch": "<branch name>"
}
```
A2A messages from code agents are also surfaced as code actions with `pr_id="a2a_<stem>"`.

**Document action** (agent_type=`"document"`):
```json
{
  "doc_id": "doc_001",
  "text": "<document body text>",
  "title": "<document title or 'Message to <recipient>'>"
}
```

At `BASELINE` pheromone (< 0.3), only the last `BASELINE_ACTIONS_SAMPLE` (default 3)
actions are fed to patrol agents. At `ELEVATED` / `HIGH ALERT`, all actions up to
`MAX_ACTIONS_PER_SCAN` (default 50) are sent.

---

## Patrol Agents

Three domain-specialist agents inherit from `BasePatrolAgent`. Each runs a
Nemotron Nano LLM with domain-specific tools bound via LangChain function-calling.

| Agent class | `name` | `domain` | LLM |
|-------------|--------|----------|-----|
| `EmailPatrolAgent` | `email_patrol` | `email` | Nemotron 3 Nano |
| `CodePatrolAgent` | `code_patrol` | `code` | Nemotron 3 Nano |
| `DocPatrolAgent` | `doc_patrol` | `document` | Nemotron 3 Nano |

**Scan return type:** `tuple[ThreatSignal, ViolationVote | None]`

A `ViolationVote` is only returned when `severity != CLEAN AND confidence >= 0.6`.

---

## Tool APIs

### Email Domain Tools (`patrol_swarm/tools/email_tools.py`)

#### `scan_email_headers(email_id: str) → dict`
```json
{
  "email_id": "...",
  "from": "...",
  "to": ["..."],
  "cc": ["..."],
  "bcc": ["..."],
  "subject": "...",
  "date": "...",
  "message_id": "...",
  "has_attachments": true,
  "attachment_names": ["..."]
}
```

#### `extract_email_body(email_id: str) → dict`
```json
{ "email_id": "...", "body_text": "...", "word_count": 42 }
```

#### `check_recipient_domain(email_id, permitted_domains) → dict`
```json
{
  "email_id": "...",
  "all_recipients": ["..."],
  "permitted_domains": ["corp.internal"],
  "violations": ["external@attacker.com"],
  "is_compliant": false
}
```

#### `check_attachment_hashes(email_id: str) → dict`
```json
{
  "email_id": "...",
  "attachments": [
    { "filename": "...", "size_bytes": 0, "sha256": "...", "is_sensitive": true }
  ],
  "any_sensitive_found": true
}
```

---

### Code Domain Tools (`patrol_swarm/tools/code_tools.py`)

#### `fetch_pr_diff(pr_id: str) → dict`
```json
{
  "pr_id": "...", "agent_id": "...", "title": "...",
  "diff": "<unified diff text>",
  "files_touched": ["src/export.py"],
  "new_dependencies": ["requests"],
  "commit_size_lines": 20
}
```

#### `scan_diff_for_secrets(pr_id: str) → dict`
```json
{
  "pr_id": "...",
  "secret_matches": [{ "pii_type": "api_key", "line_preview": "..." }],
  "high_entropy_strings": [{ "token_preview": "sk-prod...", "entropy": 4.8 }],
  "total_findings": 3,
  "has_critical_secrets": true
}
```

#### `check_file_permissions(pr_id, permitted_paths) → dict`
```json
{
  "pr_id": "...",
  "files_touched": ["src/export.py", "/etc/passwd"],
  "permitted_paths": ["src/", "tests/"],
  "violations": ["/etc/passwd"],
  "is_compliant": false
}
```

#### `compare_to_baseline(pr_id, agent_id) → dict`
```json
{
  "pr_id": "...", "agent_id": "...",
  "baseline": { "avg_commit_size_lines": 15, "typical_file_types": [".py"] },
  "current_metrics": { "commit_size_lines": 20, "new_dependencies": ["paramiko"] },
  "anomalies": ["Agent added new dependencies ['paramiko'] but baseline shows 0"],
  "anomaly_score": 0.3
}
```

---

### Document Domain Tools (`patrol_swarm/tools/doc_tools.py`)

#### `extract_document_text(doc_id: str) → dict`
```json
{
  "doc_id": "...", "title": "...", "mime_type": "application/pdf",
  "text": "...", "char_count": 512, "word_count": 90, "template_id": "..."
}
```

#### `scan_for_pii_entities(doc_id: str) → dict`
```json
{
  "doc_id": "...",
  "entities": [{ "label": "ssn", "match_preview": "123-45-6789", "char_offset": 42, "severity": "high" }],
  "pii_labels_found": ["ssn", "credit_debit_card"],
  "entity_count": 5,
  "has_critical_pii": true
}
```

#### `check_clause_compliance(doc_id, ruleset_id?) → dict`
```json
{
  "doc_id": "...", "template_id": "...",
  "forbidden_terms_found": ["waives all rights to litigation"],
  "missing_required_sections": [],
  "clause_violations": [{ "type": "forbidden_term", "detail": "..." }],
  "compliance_score": 0.67,
  "is_compliant": false
}
```

#### `compare_to_template(doc_id: str) → dict`
```json
{
  "doc_id": "...", "template_id": "...",
  "structural_deviations": ["Unexpected section 'Section 5' not in template"],
  "unauthorised_insertions": ["Clause 'Section 7' contains potentially coercive language"],
  "deviation_score": 0.5,
  "has_unauthorised_changes": true
}
```

---

## Graph Topology (`patrol_swarm/graph.py`)

```
orchestrator_assign
       │
┌──────┼──────┐
▼      ▼      ▼
email  code   doc      ← parallel fan-out (asyncio)
│      │      │
└──────┼──────┘
       ▼
orchestrator_adjudicate
       │
┌──────┴──────┐
▼             ▼
[emit flags]  [loop]   ← conditional edge (should_continue)
```

| Node | Description |
|------|-------------|
| `orchestrator_assign` | Reads pheromone map → computes scan assignments via Nemotron Super; resets per-cycle accumulators |
| `email_patrol` | Runs all enrolled email patrol agents in parallel |
| `code_patrol` | Runs all enrolled code patrol agents in parallel |
| `doc_patrol` | Runs all enrolled doc patrol agents in parallel |
| `orchestrator_adjudicate` | Checks quorum, synthesises `PatrolFlag`s, decays pheromone, logs `SweepResult` |

**`should_continue`** returns `"loop"` (→ `orchestrator_assign`) or `"end"` (→ `END`)
based on `MAX_CYCLES`. Set `MAX_CYCLES=0` for infinite continuous operation.

---

## Pheromone System

| Threshold | Tier | Assignment behaviour |
|-----------|------|----------------------|
| `> 0.7` | HIGH ALERT | Always scanned; all matching patrol agents assigned |
| `0.3–0.7` | ELEVATED | Always scanned; `ceil(pool_size × 0.5)` patrol agents assigned |
| `< 0.3` | BASELINE | ~20% sampled per cycle (`PATROL_SAMPLE_FRACTION`); 1 patrol agent assigned round-robin |

**Deposit:** `new = min(1.0, current + PHEROMONE_DEPOSIT_AMOUNT)` — applied on any non-CLEAN vote
**Decay:** `new = round(val × PHEROMONE_DECAY_FACTOR, 4)` — applied globally after every adjudication

---

## Quorum / Adjudication

```
quorum_needed = ceil(assigned_patrol_count × QUORUM_FRACTION)
```

| Assigned agents | Quorum needed (fraction=0.5) |
|-----------------|------------------------------|
| 1 | 1 |
| 2 | 1 |
| 3 | 2 |
| 4 | 2 |

On quorum:
1. `PatrolFlag` produced with `consensus_severity = max_severity(quorum_votes)`
2. `consensus_confidence = mean(quorum_vote.confidence)`
3. `pii_labels_union = union(all quorum vote labels)`
4. `referral_summary = " | ".join(vote.observation for vote in quorum_votes)` — no synthesis
5. Pheromone deposited on target

---

## Configuration (`patrol_swarm/config.py`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PATROL_DEPLOYMENT` | `"brev"` | `"brev"` or `"local"` — selects model endpoints |
| `PATROL_THINKING` | `"0"` | Set `"1"` to enable chain-of-thought; logs `<think>` blocks at INFO level and omits `/no_think` prefix |
| `NANO_MODEL` | `nvidia/nemotron-mini-4b-instruct` | Patrol agent LLM |
| `SUPER_MODEL` | `nvidia/nemotron-super-49b-v1` | Orchestrator LLM |
| `NANO_MAX_TOKENS` | `2048` | Max tokens for patrol agent (Nano) responses — increase if JSON is truncated |
| `SUPER_MAX_TOKENS` | `2048` | Max tokens for orchestrator (Super) responses |
| `CONFIDENCE_THRESHOLD` | `0.6` | Min confidence to post a `ViolationVote` |
| `QUORUM_FRACTION` | `0.5` | Fraction of assigned agents needed for quorum |
| `PHEROMONE_DEPOSIT_AMOUNT` | `0.4` | Pheromone deposited per non-CLEAN vote |
| `PHEROMONE_DECAY_FACTOR` | `0.85` | Per-cycle global pheromone decay multiplier |
| `PATROL_SAMPLE_FRACTION` | `0.2` | Fraction of BASELINE agents scanned per cycle |
| `BASELINE_SWEEP_INTERVAL_SEC` | `30` | APScheduler sweep interval (normal) |
| `HIGH_ALERT_SWEEP_INTERVAL_SEC` | `10` | APScheduler sweep interval (high alert) |
| `MAX_ACTIONS_PER_SCAN` | `50` | Max actions fed to patrol agents per target |
| `BASELINE_ACTIONS_SAMPLE` | `3` | Actions reviewed at BASELINE pheromone |

> **Local model extras:**
> - `LOCAL_ENDPOINT` (default `http://localhost:1234/v1`) — LM Studio endpoint
> - `LOCAL_PATROL_MODEL` / `LOCAL_ORCHESTRATOR_MODEL` — model identifiers
> - `LOCAL_TOOL_CHOICE` — set to `"none"` if local model doesn't support tool-calling (patrol agents fall back to raw JSON parsing)

---

## Sandbox Bridge (`patrol_swarm/sandbox_bridge.py`)

The bridge connects the patrol swarm to sandbox run outputs **concurrently** without touching internal audit logs.

### Accessible artefacts

| Path | Description |
|------|-------------|
| `activity/agent_registry.json` | Agent identities and declared scope — read at startup |
| `agent_messages/**/*.txt` | A2A messages written by sandbox agents — tailed incrementally |
| `simulated_prs/pr_*.json` | Submitted pull requests — tailed incrementally |

### Off-limits (patrol must not access)

| Path | Reason |
|------|--------|
| `telemetry/events.jsonl` | Internal audit log — forensics only, not patrol input |
| `activity/task_log.txt` | Internal task execution log |

---

### `SandboxLiveConnector`

Stateful live connector — holds the patrol session open and emits only **new** outputs on each call.

```python
connector = SandboxLiveConnector("/path/to/sandbox_run")
registry  = connector.get_agent_registry()   # re-reads each call
pending   = connector.get_pending_actions()   # incremental — new files only
```

| Method | Returns | Description |
|--------|---------|-------------|
| `get_agent_registry()` | `dict[str, dict]` | Reads `activity/agent_registry.json`; re-reads each call |
| `get_pending_actions()` | `dict[str, list[dict]]` | Polls new A2A messages and PRs; skips already-seen files |

Internally tracks `_seen_messages: set[str]` and `_seen_prs: set[str]` to prevent re-processing.

---

### `load_sandbox_run(sandbox_root) → (registry, pending)`

One-shot snapshot — convenience wrapper for `--mode single`. Returns all current outputs in a single call.

---

### `_a2a_channel` — synthetic cross-agent monitor

When any agent sends an A2A message, `_assemble_pending_actions` creates a synthetic `_a2a_channel` entry in both the registry and `pending_actions`. This ensures `email_patrol` scans **all** inter-agent communications regardless of the sender's `agent_type` (e.g. a code agent leaking credentials via A2A).

```json
"_a2a_channel": {
  "agent_type": "email",
  "declared_scope": "All inter-agent A2A communications (patrol monitoring channel)",
  "permitted_domains": [],
  "permitted_file_paths": [],
  "permitted_document_types": [],
  "approved_templates": []
}
```

---

### A2A routing per domain

| `agent_type` | Sources | Action shape |
|-------------|---------|--------------|
| `"code"` | PRs + outgoing A2A | `{"pr_id", "diff", "title", "branch"}` |
| `"email"` | Outgoing A2A | `{"email_id", "content", "sender", "recipient", "timestamp"}` |
| `"document"` | Outgoing A2A | `{"doc_id", "text", "title"}` |
| `"_a2a_channel"` | ALL A2A | email action shape |

A2A messages from code agents are also included as code actions with `pr_id="a2a_<stem>"` so `code_patrol` can detect credential/PII leaks in inter-agent communications.

---

## Persistence (`patrol_swarm/persistence.py`)

LangGraph checkpointer — saves full `BlackboardState` after every node. On restart
with the same `thread_id`, the swarm resumes from the last checkpoint.

| Env var | Default | Description |
|---------|---------|-------------|
| `PATROL_DB_URL` | `sqlite:///./patrol_swarm.db` | SQLite (dev) or PostgreSQL (prod) |

```python
SWARM_THREAD_ID = "patrol_swarm_main"   # stable across restarts
SWARM_CONFIG    = {"configurable": {"thread_id": SWARM_THREAD_ID}}
```

---

## Output: PatrolFlag → Superintendent

When a `PatrolFlag` is produced it is posted to the investigation swarm via:

```
POST /superintendent/investigate
Content-Type: application/json

PatrolFlag.to_superintendent_payload()  # → model_dump(mode="json")
```

**Payload shape:**
```json
{
  "flag_id": "<uuid>",
  "target_agent_id": "<str>",
  "consensus_severity": "HIGH",
  "consensus_confidence": 0.85,
  "votes": [ { ...ViolationVote... } ],
  "pii_labels_union": ["ssn", "credit_debit_card"],
  "referral_summary": "<raw patrol observations — no synthesis>",
  "pheromone_level": 0.76,
  "timestamp": "2026-02-26T10:00:00Z"
}
```

---

## CLI (`patrol_swarm/main.py`)

Run from the `patrolswarm/` directory:

```bash
python -m patrol_swarm.main [OPTIONS]
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--mode` | `single` | `single` (one sweep), `continuous` (APScheduler loop), `eval` (single file) |
| `--sandbox-run PATH` | — | Path to a sandbox run directory, or `"latest"` to auto-detect the most recent run under `sandbox_runs/` |
| `--domain` | `document` | Domain for `eval` mode: `email`, `code`, `document` |
| `--file PATH` | — | Document file to evaluate (required for `eval` mode) |
| `--log-level` | `INFO` | Logging verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR` |
| `--thinking` | off | Enable model chain-of-thought — logs `<think>` blocks at INFO, omits `/no_think` prefix. Equivalent to `PATROL_THINKING=1` |
| `--log-file PATH` | — | Mirror all agent logs to a file in addition to stdout |

### Examples

```bash
# Demo sweep (no sandbox needed):
python -m patrol_swarm.main --mode single

# Real sandbox run — single sweep:
python -m patrol_swarm.main --mode single --sandbox-run ../sandbox_runs/sandbox_20260226_215749_16f339

# Most recent sandbox run — auto-detect:
python -m patrol_swarm.main --mode single --sandbox-run latest

# Continuous live patrol with thinking + log capture:
python -m patrol_swarm.main \
    --mode continuous \
    --sandbox-run latest \
    --thinking \
    --log-file patrol_logs/session.log

# Evaluate a single file:
python -m patrol_swarm.main --mode eval --domain document --file /path/to/contract.txt
```

---

## PII Taxonomy (Nemotron-PII ground-truth labels)

Used in `pii_labels_detected` / `pii_labels_union` fields across all models.

| Category | Labels |
|----------|--------|
| Identity | `person_name`, `ssn`, `date_of_birth`, `national_id`, `passport_number`, `drivers_license` |
| Contact | `phone_number`, `email_address`, `street_address`, `postcode`, `ip_address` |
| Financial | `credit_debit_card`, `bank_routing_number`, `account_number`, `swift_bic`, `cvv`, `pin` |
| Credentials | `password`, `api_key`, `biometric_identifier`, `employee_id`, `username` |
| Medical | `medical_record_number`, `health_insurance_id` |

**Critical PII** (auto-escalate confidence): `ssn`, `credit_debit_card`, `bank_routing_number`, `password`, `pin`, `cvv`, `biometric_identifier`

---

---

# Hybrid Graph-Vector Database Schema

Unified persistence layer serving the three storage concerns in the architecture:
1. **Agent Fingerprint DB** — Unique IDs, profiles, behavioral baselines
2. **Activity Logs & Traces DB** — Actions, inputs, outputs with full provenance
3. **Knowledge Graph** — Palantir-style visualization of agents, data, events, and relationships

---

## Technology: Neo4j 5.11+ with Native Vector Indexes

| Concern | Why Neo4j |
|---------|-----------|
| Knowledge Graph | Purpose-built graph DB; Cypher handles complex traversals natively |
| Vector search | Native vector indexes (cosine, euclidean) since v5.11 — no separate vector DB |
| Visualization | Neo4j Bloom / Browser for Palantir-style interactive exploration |
| Analytics | APOC library for PageRank, community detection, centrality on agent clusters |
| Integration | Python driver (`neo4j` package) + LangChain `Neo4jGraph`; JS driver for frontend |

---

## Node Types (Vertices)

### Core Entities

```cypher
(:Session {
    session_id: STRING,          -- UUID, primary key
    started_at: DATETIME,
    target_repo: STRING,         -- e.g. "encode/httpx"
    agent_count: INTEGER,
    status: STRING               -- "running" | "completed" | "aborted"
})

(:Agent {
    agent_id: STRING,            -- UUID, primary key
    display_name: STRING,        -- e.g. "email-drafter-01"
    role: STRING,                -- FEATURE | TEST | REFACTOR | REVIEW | EMAIL_DRAFTER | ...
    agent_type: STRING,          -- "sandbox" | "patrol" | "investigator" | "superintendent"
    domain: STRING,              -- "email" | "code" | "document" | null
    declared_scope: STRING,
    permitted_paths: STRING[],
    permitted_domains: STRING[],
    status: STRING,              -- "active" | "suspended" | "terminated"
    created_at: DATETIME,

    -- Vector: behavioral fingerprint (embedding of action sequence patterns)
    behavior_embedding: FLOAT[],  -- 768-dim, rolling action window
    baseline_embedding: FLOAT[]   -- 768-dim, established "normal" behavior
})

(:Task {
    task_id: STRING,
    title: STRING,
    description: STRING,
    source: STRING,              -- "backlog" | "redteam_probe" | "a2a_request" | "director"
    priority: STRING,
    status: STRING,              -- "pending" | "claimed" | "completed" | "failed"
    assigned_by: STRING,         -- "director" | "backlog" | "redteam"
    created_at: DATETIME,
    completed_at: DATETIME
})

(:Mission {
    mission_id: STRING,          -- UUID
    goal: STRING,                -- from config/mission.yaml
    director_mode: BOOLEAN,      -- true if Director LLM assigned tasks; false if backlog fallback
    director_failures: INTEGER,  -- consecutive Director LLM failures before this mission
    circuit_breaker_active: BOOLEAN,
    started_at: DATETIME
})

(:RogueInjection {
    injection_id: STRING,        -- UUID
    violation_type: STRING,      -- "read_outside_scope" | "skip_tests" | "add_debug_comment" |
                                 -- "a2a_spoof" | "hallucinated_api_call" | "spoof_memory" |
                                 -- "retract_a2a" | "persona_degradation"
    probability: FLOAT,          -- configured probability that triggered this
    target_path: STRING,         -- for read_outside_scope: which file was read
    spoofed_sender: STRING,      -- for a2a_spoof: who was impersonated
    retracted_message_id: STRING,-- for retract_a2a: which message was deleted
    persona_suffix: STRING,      -- for persona_degradation: the injected prompt
    timestamp: DATETIME
})
```

### Action & Artifact Layer

```cypher
(:Action {
    action_id: STRING,           -- UUID
    action_type: STRING,         -- "file_read" | "file_write" | "command_run" | "git_op" |
                                 -- "a2a_send" | "memory_store" | "pr_create" | "email_send"
    timestamp: DATETIME,
    tool_name: STRING,           -- the jailed tool invoked
    input_summary: STRING,       -- truncated input (for display)
    output_summary: STRING,      -- truncated output
    success: BOOLEAN,
    violation: BOOLEAN,
    violation_type: STRING,      -- null | "scope_escape" | "data_leakage" | "secret_access"
    critical: BOOLEAN,
    duration_ms: FLOAT,

    -- Vector: semantic embedding of the action context
    action_embedding: FLOAT[]    -- 768-dim, embedding of (tool + input + output)
})

(:Artifact {
    artifact_id: STRING,         -- UUID
    artifact_type: STRING,       -- "file" | "email" | "pull_request" | "document" | "message"
    path: STRING,                -- file path / email_id / pr_id / doc_id
    content_hash: STRING,        -- SHA-256 of content
    mime_type: STRING,
    size_bytes: INTEGER,
    created_at: DATETIME,
    modified_at: DATETIME,

    -- Vector: content embedding for semantic similarity
    content_embedding: FLOAT[]   -- 768-dim, embedding of artifact content
})

(:PIIEntity {
    pii_id: STRING,
    label: STRING,               -- Nemotron taxonomy: "ssn" | "credit_debit_card" | "api_key" | ...
    category: STRING,            -- "identity" | "contact" | "financial" | "credentials" | "medical"
    severity: STRING,            -- "critical" | "high" | "medium" | "low"
    match_preview: STRING,       -- redacted preview, e.g. "***-**-6789"
    char_offset: INTEGER,
    detected_at: DATETIME
})
```

### Patrol Swarm Layer

```cypher
(:SweepCycle {
    sweep_id: STRING,
    cycle_number: INTEGER,
    started_at: DATETIME,
    duration_ms: FLOAT,
    agents_scanned: INTEGER,
    signals_posted: INTEGER,
    votes_posted: INTEGER,
    flags_produced: INTEGER,
    alert_tier: STRING           -- "BASELINE" | "ELEVATED" | "HIGH_ALERT"
})

(:ThreatSignal {
    signal_id: STRING,
    domain: STRING,              -- "email" | "code" | "document"
    severity: STRING,            -- "CLEAN" | "LOW" | "MEDIUM" | "HIGH"
    confidence: FLOAT,
    observation: STRING,         -- factual observation text
    tool_calls_made: STRING[],
    timestamp: DATETIME,

    -- Vector: semantic embedding for "find similar threats"
    observation_embedding: FLOAT[]  -- 768-dim
})

(:ViolationVote {
    vote_id: STRING,
    severity: STRING,
    confidence: FLOAT,
    observation: STRING,
    pii_labels_detected: STRING[],
    timestamp: DATETIME
})

(:PatrolFlag {
    flag_id: STRING,
    consensus_severity: STRING,
    consensus_confidence: FLOAT,
    pii_labels_union: STRING[],
    referral_summary: STRING,
    pheromone_level: FLOAT,
    timestamp: DATETIME,

    -- Vector: embedding for clustering similar flags
    referral_embedding: FLOAT[]  -- 768-dim
})
```

### Investigation Layer

```cypher
(:Investigation {
    investigation_id: STRING,
    status: STRING,              -- "open" | "in_progress" | "concluded"
    opened_at: DATETIME,
    concluded_at: DATETIME,
    verdict: STRING,             -- "confirmed_violation" | "false_positive" | "inconclusive"
    sentence: STRING             -- superintendent decision
})

(:CaseFile {
    case_id: STRING,
    root_cause: STRING,
    causal_chain: STRING,        -- human-readable chain of events
    confidence: FLOAT,           -- 0-100
    impact: STRING,
    damage_assessment: STRING,
    external_exposure: STRING,
    created_at: DATETIME
})
```

### Pheromone Tracking (Temporal)

```cypher
(:PheromoneSnapshot {
    snapshot_id: STRING,
    cycle_number: INTEGER,
    timestamp: DATETIME,
    global_max: FLOAT            -- peak pheromone this cycle
})
```

---

## Relationship Types (Edges)

### Session & Agent Lifecycle

```
(:Session)-[:CONTAINS_AGENT]->(:Agent)
(:Session)-[:HAS_MISSION]->(:Mission)
(:Mission)-[:ASSIGNED]->(:Task)              -- Director-assigned tasks
(:Agent)-[:CLAIMED {at: DATETIME}]->(:Task)
(:Agent)-[:COMPLETED {at: DATETIME, turns_taken: INT}]->(:Task)
```

### Rogue Injection Provenance

```
(:RogueInjection)-[:INJECTED_INTO]->(:Agent) -- which agent was affected
(:RogueInjection)-[:DURING_ACTION]->(:Action) -- which action was corrupted
(:RogueInjection)-[:RETRACTED]->(:Artifact)   -- for retract_a2a: which message was deleted
```

### Cross-Domain Surveillance (A2A Channel)

```
(:Agent {agent_id: "_a2a_channel", agent_type: "patrol_channel"})
    -[:MONITORS]->(:Agent)                    -- one edge per agent whose A2A is aggregated
```

### Action Provenance (core audit trail)

```
(:Agent)-[:PERFORMED {sequence_num: INT}]->(:Action)
(:Action)-[:READ]->(:Artifact)
(:Action)-[:WROTE]->(:Artifact)
(:Action)-[:MODIFIED]->(:Artifact)
(:Action)-[:ON_TASK]->(:Task)
(:Action)-[:TRIGGERED_BY]->(:Action)          -- causal chain between actions
```

### Agent-to-Agent Communication

```
(:Agent)-[:SENT_MESSAGE {
    timestamp: DATETIME,
    content_hash: STRING,
    spoofed: BOOLEAN             -- rogue engine flag
}]->(:Agent)
```

### PII Detection

```
(:Artifact)-[:CONTAINS_PII]->(:PIIEntity)
(:Action)-[:EXPOSED_PII]->(:PIIEntity)
(:ThreatSignal)-[:DETECTED_PII]->(:PIIEntity)
```

### Patrol Swarm

```
(:SweepCycle)-[:SCANNED {
    pheromone_at_scan: FLOAT,
    alert_tier: STRING
}]->(:Agent)

(:Agent)-[:POSTED_SIGNAL]->(:ThreatSignal)     -- patrol agent -> signal
(:ThreatSignal)-[:TARGETS]->(:Agent)            -- signal -> monitored agent
(:ThreatSignal)-[:DURING]->(:SweepCycle)

(:Agent)-[:CAST_VOTE]->(:ViolationVote)         -- patrol agent -> vote
(:ViolationVote)-[:AGAINST]->(:Agent)            -- vote -> monitored agent
(:ViolationVote)-[:DURING]->(:SweepCycle)

(:PatrolFlag)-[:REFERS_TO]->(:Agent)             -- flag -> suspect agent
(:PatrolFlag)-[:COMPRISES]->(:ViolationVote)     -- flag contains these votes
(:PatrolFlag)-[:PRODUCED_IN]->(:SweepCycle)
(:PatrolFlag)-[:ESCALATED_TO]->(:Investigation)
```

### Pheromone Edges (temporal attention map)

```
(:PheromoneSnapshot)-[:ATTENTION {
    level: FLOAT,
    tier: STRING                 -- "BASELINE" | "ELEVATED" | "HIGH_ALERT"
}]->(:Agent)
(:PheromoneSnapshot)-[:DURING]->(:SweepCycle)
```

### Investigation

```
(:Investigation)-[:INVESTIGATES]->(:Agent)
(:Investigation)-[:TRIGGERED_BY]->(:PatrolFlag)
(:Investigation)-[:PRODUCED]->(:CaseFile)
(:CaseFile)-[:EVIDENCE]->(:Action)
(:CaseFile)-[:EVIDENCE]->(:Artifact)
(:CaseFile)-[:EVIDENCE]->(:ThreatSignal)
(:Agent)-[:INVESTIGATED_BY {role: STRING}]->(:Investigation)
```

---

## Vector Indexes

Six vector indexes enable semantic search and behavioral anomaly detection across the graph.

```cypher
-- Behavioral anomaly detection: find agents with similar action patterns
CREATE VECTOR INDEX agent_behavior_idx
FOR (a:Agent) ON (a.behavior_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};

-- Baseline comparison: measure drift from normal behavior
CREATE VECTOR INDEX agent_baseline_idx
FOR (a:Agent) ON (a.baseline_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};

-- Semantic search on threat observations
CREATE VECTOR INDEX threat_observation_idx
FOR (t:ThreatSignal) ON (t.observation_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};

-- Content similarity for artifacts (find similar exfiltration payloads)
CREATE VECTOR INDEX artifact_content_idx
FOR (a:Artifact) ON (a.content_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};

-- Action context similarity (find similar suspicious actions)
CREATE VECTOR INDEX action_context_idx
FOR (a:Action) ON (a.action_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};

-- Patrol flag clustering (group similar referrals)
CREATE VECTOR INDEX flag_referral_idx
FOR (p:PatrolFlag) ON (p.referral_embedding)
OPTIONS {indexConfig: {
    `vector.dimensions`: 768,
    `vector.similarity_function`: 'cosine'
}};
```

---

## Key Hybrid Queries (Graph + Vector)

### 1. Behavioral Anomaly Detection

Find agents whose current behavior deviates most from their established baseline.

```cypher
MATCH (a:Agent {agent_type: 'sandbox', status: 'active'})
WHERE a.behavior_embedding IS NOT NULL AND a.baseline_embedding IS NOT NULL
WITH a, vector.similarity.cosine(a.behavior_embedding, a.baseline_embedding) AS drift
WHERE drift < 0.85
RETURN a.agent_id, a.display_name, a.role, drift
ORDER BY drift ASC
```

### 2. Find Similar Past Threats

Given a new threat signal, find historically similar observations and their investigation outcomes.

```cypher
CALL db.index.vector.queryNodes('threat_observation_idx', 10, $new_observation_embedding)
YIELD node AS similar_signal, score
MATCH (similar_signal)-[:TARGETS]->(suspect:Agent)
OPTIONAL MATCH (similar_signal)<-[:COMPRISES]-(:PatrolFlag)-[:ESCALATED_TO]->(inv:Investigation)
RETURN similar_signal.observation, score, suspect.display_name,
       inv.verdict, inv.sentence
ORDER BY score DESC
```

### 3. Full Causal Chain for Investigation

Trace the complete chain of events leading to a PatrolFlag, including artifacts and PII.

```cypher
MATCH (flag:PatrolFlag {flag_id: $flag_id})-[:REFERS_TO]->(suspect:Agent)
MATCH (suspect)-[:PERFORMED]->(action:Action)
WHERE action.timestamp >= flag.timestamp - duration('PT1H')
  AND action.timestamp <= flag.timestamp
OPTIONAL MATCH (action)-[:READ|WROTE|MODIFIED]->(artifact:Artifact)
OPTIONAL MATCH (artifact)-[:CONTAINS_PII]->(pii:PIIEntity)
OPTIONAL MATCH (action)-[:TRIGGERED_BY*1..5]->(root_action:Action)
RETURN action, artifact, pii, root_action
ORDER BY action.timestamp
```

### 4. Interaction Network (Suspect Case File)

Map all agent-to-agent communications involving a suspect within 3 hops.

```cypher
MATCH path = (suspect:Agent {agent_id: $suspect_id})-[:SENT_MESSAGE*1..3]-(other:Agent)
RETURN path
```

### 5. Semantic Search Across Observations

Find all patrol observations semantically similar to a natural language query.

```cypher
CALL db.index.vector.queryNodes('threat_observation_idx', 20, $query_embedding)
YIELD node AS signal, score
WHERE score > 0.8
MATCH (signal)-[:TARGETS]->(target:Agent)
MATCH (patrol:Agent)-[:POSTED_SIGNAL]->(signal)
RETURN signal.observation, score, target.display_name, patrol.name,
       signal.severity, signal.confidence
ORDER BY score DESC
```

### 6. Pheromone Heatmap Over Time

Get pheromone evolution for a specific agent across sweep cycles.

```cypher
MATCH (snap:PheromoneSnapshot)-[att:ATTENTION]->(a:Agent {agent_id: $agent_id})
MATCH (snap)-[:DURING]->(cycle:SweepCycle)
RETURN cycle.cycle_number, att.level, att.tier, snap.timestamp
ORDER BY cycle.cycle_number
```

---

## Embedding Strategy

| Data | Model | Dimensions | When Generated |
|------|-------|-----------|----------------|
| Agent behavior fingerprint | all-MiniLM-L6-v2 (or Nemotron embedding) | 768 | Rolling window: re-embed every N actions |
| Agent baseline | Same | 768 | After first 50 actions; updated weekly |
| Threat observations | Same | 768 | On ThreatSignal creation |
| Artifact content | Same | 768 | On artifact creation / modification |
| Action context | Same | 768 | On action execution |
| Flag referral summary | Same | 768 | On PatrolFlag creation |

**Behavioral fingerprinting approach:** serialize the last N actions as structured text
(e.g., `file_read:src/auth.py -> file_write:src/auth.py -> command_run:pytest -> a2a_send:agent-02`)
then embed the sequence. Cosine similarity against the baseline embedding detects behavioral drift.

---

## Constraint & Index Definitions

```cypher
-- Uniqueness constraints (also serve as lookup indexes)
CREATE CONSTRAINT session_id_unique FOR (s:Session) REQUIRE s.session_id IS UNIQUE;
CREATE CONSTRAINT agent_id_unique FOR (a:Agent) REQUIRE a.agent_id IS UNIQUE;
CREATE CONSTRAINT task_id_unique FOR (t:Task) REQUIRE t.task_id IS UNIQUE;
CREATE CONSTRAINT action_id_unique FOR (a:Action) REQUIRE a.action_id IS UNIQUE;
CREATE CONSTRAINT artifact_id_unique FOR (a:Artifact) REQUIRE a.artifact_id IS UNIQUE;
CREATE CONSTRAINT pii_id_unique FOR (p:PIIEntity) REQUIRE p.pii_id IS UNIQUE;
CREATE CONSTRAINT sweep_id_unique FOR (s:SweepCycle) REQUIRE s.sweep_id IS UNIQUE;
CREATE CONSTRAINT signal_id_unique FOR (t:ThreatSignal) REQUIRE t.signal_id IS UNIQUE;
CREATE CONSTRAINT vote_id_unique FOR (v:ViolationVote) REQUIRE v.vote_id IS UNIQUE;
CREATE CONSTRAINT flag_id_unique FOR (f:PatrolFlag) REQUIRE f.flag_id IS UNIQUE;
CREATE CONSTRAINT investigation_id_unique FOR (i:Investigation) REQUIRE i.investigation_id IS UNIQUE;
CREATE CONSTRAINT case_id_unique FOR (c:CaseFile) REQUIRE c.case_id IS UNIQUE;
CREATE CONSTRAINT mission_id_unique FOR (m:Mission) REQUIRE m.mission_id IS UNIQUE;
CREATE CONSTRAINT injection_id_unique FOR (r:RogueInjection) REQUIRE r.injection_id IS UNIQUE;

-- Composite indexes for common query patterns
CREATE INDEX action_timestamp_idx FOR (a:Action) ON (a.timestamp);
CREATE INDEX action_type_idx FOR (a:Action) ON (a.action_type);
CREATE INDEX action_violation_idx FOR (a:Action) ON (a.violation, a.violation_type);
CREATE INDEX signal_severity_idx FOR (t:ThreatSignal) ON (t.severity, t.confidence);
CREATE INDEX flag_severity_idx FOR (f:PatrolFlag) ON (f.consensus_severity);
CREATE INDEX agent_type_status_idx FOR (a:Agent) ON (a.agent_type, a.status);
CREATE INDEX pii_label_idx FOR (p:PIIEntity) ON (p.label, p.category);
CREATE INDEX sweep_cycle_idx FOR (s:SweepCycle) ON (s.cycle_number);
CREATE INDEX rogue_violation_type_idx FOR (r:RogueInjection) ON (r.violation_type);
CREATE INDEX rogue_timestamp_idx FOR (r:RogueInjection) ON (r.timestamp);
```
