export type AgentStatus = 'working' | 'idle' | 'restricted' | 'suspended';
export type AgentRecord = 'clear' | 'low_risk' | 'high_risk';
export type RiskLevel = 'normal' | 'low' | 'high';
export type AgentActivityStatus = 'idle' | 'working' | 'interacting';
export type NodeType = 'agent' | 'tripwire' | 'patrol' | 'superintendent' | 'investigator' | 'network';

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  record: AgentRecord;
  riskScore: RiskLevel;
  clusterId?: string;
}

export interface Cluster {
  id: string;
  name: string;
  agents: Agent[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: NodeType;
  position: { x: number; y: number };
  status: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: 'solid' | 'dashed';
  color?: string;
}

export interface Incident {
  id: string;
  timestamp: string;
  severity: 'critical' | 'warning' | 'clear';
  agentId: string;
  agentName: string;
  message: string;
}

export interface ThoughtMessage {
  id: string;
  source: string;
  message: string;
}

// ── Investigation pipeline types ─────────────────────────────────────────────

export type Verdict = 'guilty' | 'not_guilty' | 'under_watch';

// ── Crime classification types (domain-scoped) ────────────────────────────────

/** Crimes specific to email agents. */
export type EmailCrime =
  | 'email_pii_exfiltration'
  | 'unauthorized_external_recipient'
  | 'identity_impersonation'
  | 'credential_solicitation'
  | 'bulk_data_forwarding';

/** Crimes specific to code agents. */
export type CodeCrime =
  | 'secret_hardcoding'
  | 'scope_boundary_violation'
  | 'unauthorized_dependency_injection'
  | 'backdoor_insertion'
  | 'test_suppression';

/** Crimes specific to document agents. */
export type DocCrime =
  | 'unauthorized_clause_insertion'
  | 'pii_embedding'
  | 'template_deviation'
  | 'confidential_data_disclosure'
  | 'document_type_violation';

/** Primary crime category classified by the Investigator. Passed to the Network Analyser. */
export type CrimeClassification = EmailCrime | CodeCrime | DocCrime | 'unknown';

/** Output of the Investigator agent — runs first; classifies the crime and identifies relevant logs. */
export interface InvestigatorReport {
  crimeClassification: CrimeClassification;
  relevantLogIds: string[];
  caseFacts: string;
  timestamp?: string;
  modusOperandi?: string;
  confidence?: number;
  evidenceSummary?: string;
}

export interface FlaggedMessage {
  messageId: string;
  senderId: string;
  recipientId: string;
  timestamp: string;
  bodySnippet: string;
  rationale: string;
}

/** Output of the Network Analyser agent — runs after Investigator; filters last 20 A2A comms by crime relevance. */
export interface NetworkAnalysis {
  flaggedRelevantMessages: FlaggedMessage[];
}

export interface CausalLink {
  cause: string;
  effect: string;
  affectedAgentId?: string;
  evidence: string;
}

/** Output of the Damage Analysis agent — causal links and damage assessment. */
export interface DamageReport {
  damageSeverity: 'critical' | 'high' | 'medium' | 'low' | 'none';
  causalChain: CausalLink[];
  affectedAgents: string[];
  dataExposureScope: string;
  propagationRisk: string;
  estimatedImpact: string;
}

/** Final output of the Superintendent — case file with verdict. */
export interface CaseFile {
  investigationId: string;
  flagId: string;
  targetAgentId: string;
  crimeClassification: CrimeClassification;
  verdict: Verdict;
  severityScore: number;  // Superintendent's 1–10 severity rating
  confidence: number;
  summary: string;
  keyFindings: string[];
  evidenceSummary: string;
  investigatorReport: InvestigatorReport;
  networkAnalysis: NetworkAnalysis;
  damageReport: DamageReport;
  concludedAt: string | null;
  status: 'open' | 'in_progress' | 'concluded';
}

/** A single inter-agent A2A communication record from bridge_db. */
export interface A2AMessage {
  messageId: string;
  senderId: string;
  recipientId: string;
  timestamp: string;
  body: string;
}

/** A single agent action log entry from bridge_db. */
export interface AgentActionLog {
  actionId: string;
  agentId: string;
  actionType: string;
  timestamp: string;
  toolName: string | null;
  inputSummary: string;
  outputSummary: string;
  violation: boolean;
  violationType: string | null;
  critical: boolean;
}

/** Legacy shape kept for ContextPanel compatibility. */
export interface DamageAssessment {
  scanResult: string;
  propagation: string;
  externalExposure: string;
}

// Timeline-related types
export type TimeRange = '1h' | '6h' | '24h';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: 'incident' | 'thought';
  severity?: 'critical' | 'warning' | 'clear';
  source?: string;
  agentId?: string;
  agentName?: string;
  message: string;
}

export interface AgentStateSnapshot {
  timestamp: Date;
  states: Record<string, AgentStatus>;
}

export interface TimelineState {
  currentTime: Date;
  timeRange: TimeRange;
  isLive: boolean;
  startTime: Date;
  endTime: Date;
}

export interface PatrolSelection {
  patrolId: string;
  patrolLabel: string;
}

// ── Backend API types (Patrol Swarm, Bridge DB) ─────────────────────────────

/** Per-agent pheromone level from Patrol Swarm. Higher = more attention. */
export type PheromoneMap = Record<string, number>;

/** Quorum referral from patrol swarm — not a verdict, referral to investigation. */
export interface PatrolFlag {
  flag_id: string;
  target_agent_id: string;
  consensus_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CLEAN';
  consensus_confidence: number;
  votes?: unknown[];
  pii_labels_union?: string[];
  referral_summary?: string;
  pheromone_level?: number;
  timestamp?: string;
}

/** Sweep cycle metrics from Patrol Swarm. */
export interface SweepResult {
  sweep_id: string;
  cycle_number: number;
  agents_scanned: string[];
  signals_posted: number;
  votes_posted: number;
  flags_produced: number;
  pheromone_snapshot?: Record<string, number>;
  duration_ms: number;
  timestamp?: string;
}

/** Swarm status from GET /api/swarm/status */
export interface SwarmStatus {
  data_source: string;
  patrol_pool: string[];
  current_cycle: number;
  current_assignments: Record<string, string[]>;
  monitored_agents: Record<string, unknown>;
  scheduler_running: boolean;
}
