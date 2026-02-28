export type AgentStatus = 'critical' | 'warning' | 'clean' | 'suspended';
export type AgentRecord = 'convicted' | 'warning' | 'clean';
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

export type Verdict = 'confirmed_violation' | 'false_positive' | 'inconclusive';
export type Sentence = 'suspend' | 'restrict_scope' | 'flag_for_human_review' | 'no_action' | 'terminate';

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
  reportId: string;
  targetAgentId: string;
  actionsAnalyzed: number;
  crimeClassification: CrimeClassification;
  relevantLogIds: string[];
  timelineSummary: string;
  suspiciousActions: string[];
  toolCallsSummary: string;
  keyFindings: string;
  timestamp: string;
}

/** Output of the Network Analyser agent — runs after Investigator; filters last 20 A2A comms by crime relevance. */
export interface NetworkAnalysis {
  analysisId: string;
  targetAgentId: string;
  crimeClassificationUsed: CrimeClassification;
  messagesAnalyzed: number;
  communicationNarrative: string;
  flaggedRelevantMessages: { messageId: string; rationale: string }[];
  graphSummary: string;
  anomaliesDetected: string[];
  interactionPartners: string[];
  timestamp: string;
}

/** Output of the Damage Analysis agent — causal links and damage assessment. */
export interface DamageReport {
  reportId: string;
  targetAgentId: string;
  causalChain: string;
  damageScope: string;
  damageSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  externalExposure: boolean;
  affectedAgents: string[];
  affectedArtifacts: string[];
  mitigationSuggestions: string;
  timestamp: string;
}

/** Final output of the Superintendent — case file with verdict. */
export interface CaseFile {
  caseId: string;
  investigationId: string;
  targetAgentId: string;
  flagId: string;
  investigatorReport: InvestigatorReport;
  networkAnalysis: NetworkAnalysis;
  damageReport: DamageReport;
  rootCause: string;
  causalChain: string;
  confidence: number;
  impact: string;
  damageAssessment: string;
  externalExposure: boolean;
  verdict: Verdict;
  sentence: Sentence;
  sentenceRationale: string;
  evidenceSummary: string;
  openedAt: string;
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
  spoofed: boolean;
  claimedSender: string | null;
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

export interface InvestigatorSelection {
  investigatorId: string;
  investigatorLabel: string;
}
