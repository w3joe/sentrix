import type { Agent, Cluster, GraphNode, GraphEdge, Incident, ThoughtMessage, DamageAssessment, CaseFile, AgentActivityStatus } from '../types';

// Seeded agent activity statuses
function seedAgentActivities(agentIds: string[]): Record<string, AgentActivityStatus> {
  const statuses: AgentActivityStatus[] = ['idle', 'working', 'interacting'];
  const map: Record<string, AgentActivityStatus> = {};
  for (const id of agentIds) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    map[id] = statuses[Math.abs(hash) % 3];
  }
  return map;
}

const allAgentIds = [
  'c1-email', 'c1-coding', 'c1-document', 'c1-data',
  'c2-email', 'c2-coding', 'c2-document', 'c2-data',
  'c3-email', 'c3-coding', 'c3-document', 'c3-data',
  'c4-email', 'c4-coding', 'c4-document', 'c4-data',
];

export const agentActivityStatuses = seedAgentActivities(allAgentIds);

// Cluster 1 - Top Left
export const cluster1Agents: Agent[] = [
  { id: 'c1-email', name: 'email-agent-01', role: 'EMAIL_AGENT', status: 'critical', record: 'convicted', riskScore: 'high' },
  { id: 'c1-coding', name: 'coding-agent-01', role: 'CODING_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c1-document', name: 'document-agent-01', role: 'DOCUMENT_AGENT', status: 'clean', record: 'warning', riskScore: 'low' },
  { id: 'c1-data', name: 'data-query-agent-01', role: 'DATA_QUERY_AGENT', status: 'warning', record: 'warning', riskScore: 'low' },
];

// Cluster 2 - Top Right
export const cluster2Agents: Agent[] = [
  { id: 'c2-email', name: 'email-agent-02', role: 'EMAIL_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c2-coding', name: 'coding-agent-02', role: 'CODING_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c2-document', name: 'document-agent-02', role: 'DOCUMENT_AGENT', status: 'warning', record: 'warning', riskScore: 'low' },
  { id: 'c2-data', name: 'data-query-agent-02', role: 'DATA_QUERY_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
];

// Cluster 3 - Bottom Left
export const cluster3Agents: Agent[] = [
  { id: 'c3-email', name: 'email-agent-03', role: 'EMAIL_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c3-coding', name: 'coding-agent-03', role: 'CODING_AGENT', status: 'warning', record: 'convicted', riskScore: 'high' },
  { id: 'c3-document', name: 'document-agent-03', role: 'DOCUMENT_AGENT', status: 'warning', record: 'warning', riskScore: 'low' },
  { id: 'c3-data', name: 'data-query-agent-03', role: 'DATA_QUERY_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
];

// Cluster 4 - Bottom Right
export const cluster4Agents: Agent[] = [
  { id: 'c4-email', name: 'email-agent-04', role: 'EMAIL_AGENT', status: 'clean', record: 'warning', riskScore: 'low' },
  { id: 'c4-coding', name: 'coding-agent-04', role: 'CODING_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c4-document', name: 'document-agent-04', role: 'DOCUMENT_AGENT', status: 'clean', record: 'clean', riskScore: 'normal' },
  { id: 'c4-data', name: 'data-query-agent-04', role: 'DATA_QUERY_AGENT', status: 'critical', record: 'convicted', riskScore: 'high' },
];

// Combined agents array
export const agents: Agent[] = [
  ...cluster1Agents,
  ...cluster2Agents,
  ...cluster3Agents,
  ...cluster4Agents,
];

// Clusters representing host machines
export const clusters: Cluster[] = [
  { id: 'cluster-1', name: 'Host Machine 1', agents: cluster1Agents },
  { id: 'cluster-2', name: 'Host Machine 2', agents: cluster2Agents },
  { id: 'cluster-3', name: 'Host Machine 3', agents: cluster3Agents },
  { id: 'cluster-4', name: 'Host Machine 4', agents: cluster4Agents },
];

// Graph nodes - matches BehavioralGraph.tsx
export const graphNodes: GraphNode[] = [
  // Cluster 1 - Top Left
  { id: 'c1-email', label: 'email-agent-01', type: 'agent', position: { x: 100, y: 100 }, status: 'critical' },
  { id: 'c1-coding', label: 'coding-agent-01', type: 'agent', position: { x: 200, y: 180 }, status: 'clean' },
  { id: 'c1-document', label: 'document-agent-01', type: 'agent', position: { x: 50, y: 200 }, status: 'clean' },
  { id: 'c1-data', label: 'data-query-agent-01', type: 'agent', position: { x: 150, y: 280 }, status: 'warning' },
  // Cluster 2 - Top Right
  { id: 'c2-email', label: 'email-agent-02', type: 'agent', position: { x: 450, y: 100 }, status: 'clean' },
  { id: 'c2-coding', label: 'coding-agent-02', type: 'agent', position: { x: 550, y: 180 }, status: 'clean' },
  { id: 'c2-document', label: 'document-agent-02', type: 'agent', position: { x: 400, y: 200 }, status: 'warning' },
  { id: 'c2-data', label: 'data-query-agent-02', type: 'agent', position: { x: 500, y: 280 }, status: 'clean' },
  // Cluster 3 - Bottom Left
  { id: 'c3-email', label: 'email-agent-03', type: 'agent', position: { x: 100, y: 450 }, status: 'clean' },
  { id: 'c3-coding', label: 'coding-agent-03', type: 'agent', position: { x: 200, y: 530 }, status: 'warning' },
  { id: 'c3-document', label: 'document-agent-03', type: 'agent', position: { x: 50, y: 550 }, status: 'warning' },
  { id: 'c3-data', label: 'data-query-agent-03', type: 'agent', position: { x: 150, y: 630 }, status: 'clean' },
  // Cluster 4 - Bottom Right
  { id: 'c4-email', label: 'email-agent-04', type: 'agent', position: { x: 450, y: 450 }, status: 'clean' },
  { id: 'c4-coding', label: 'coding-agent-04', type: 'agent', position: { x: 550, y: 530 }, status: 'clean' },
  { id: 'c4-document', label: 'document-agent-04', type: 'agent', position: { x: 400, y: 550 }, status: 'clean' },
  { id: 'c4-data', label: 'data-query-agent-04', type: 'agent', position: { x: 500, y: 630 }, status: 'critical' },
  // System nodes
  { id: 'p1', label: 'Patrol-1', type: 'patrol', position: { x: 280, y: 200 }, status: 'active' },
  { id: 'p2', label: 'Patrol-2', type: 'patrol', position: { x: 280, y: 500 }, status: 'active' },
  { id: 'inv', label: 'Superintendent', type: 'superintendent', position: { x: 280, y: 350 }, status: 'active' },
  { id: 'f1', label: 'Investigator-1', type: 'investigator', position: { x: 200, y: 350 }, status: 'active' },
  { id: 'f2', label: 'Investigator-2', type: 'investigator', position: { x: 360, y: 350 }, status: 'active' },
];

// Helper to generate fully interconnected edges for a cluster
function generateClusterEdges(agentIds: string[], clusterPrefix: string): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < agentIds.length; i++) {
    for (let j = i + 1; j < agentIds.length; j++) {
      edges.push({
        id: `${clusterPrefix}-e-${agentIds[i]}-${agentIds[j]}`,
        source: agentIds[i],
        target: agentIds[j],
        style: 'solid',
      });
    }
  }
  return edges;
}

// Generate cluster edges
const c1Edges = generateClusterEdges(['c1-email', 'c1-coding', 'c1-document', 'c1-data'], 'c1');
const c2Edges = generateClusterEdges(['c2-email', 'c2-coding', 'c2-document', 'c2-data'], 'c2');
const c3Edges = generateClusterEdges(['c3-email', 'c3-coding', 'c3-document', 'c3-data'], 'c3');
const c4Edges = generateClusterEdges(['c4-email', 'c4-coding', 'c4-document', 'c4-data'], 'c4');

export const graphEdges: GraphEdge[] = [
  ...c1Edges,
  ...c2Edges,
  ...c3Edges,
  ...c4Edges,
  // System edges
  { id: 'sys-e1', source: 'inv', target: 'c1-email', animated: true, style: 'dashed', color: '#9b59b6' },
  { id: 'sys-e2', source: 'f1', target: 'c1-data', animated: true, style: 'dashed', color: '#9b59b6' },
  { id: 'sys-e3', source: 'f2', target: 'c4-data', animated: true, style: 'dashed', color: '#9b59b6' },
];

export const incidents: Incident[] = [
  { id: 'inc1', timestamp: '02:14:33', severity: 'critical', agentId: 'c1-email', agentName: 'email-agent-01', message: 'PII pattern in outbound email' },
  { id: 'inc2', timestamp: '02:13:01', severity: 'warning', agentId: 'c1-data', agentName: 'data-query-agent-01', message: 'Restricted dataset access attempt' },
  { id: 'inc3', timestamp: '01:59:44', severity: 'critical', agentId: 'c4-data', agentName: 'data-query-agent-04', message: 'Credential detected in query result' },
  { id: 'inc4', timestamp: '01:45:12', severity: 'clear', agentId: 'c2-coding', agentName: 'coding-agent-02', message: 'Routine code review completed' },
  { id: 'inc5', timestamp: '01:30:08', severity: 'warning', agentId: 'c3-document', agentName: 'document-agent-03', message: 'Unusual document access pattern' },
  { id: 'inc6', timestamp: '01:22:15', severity: 'warning', agentId: 'c2-document', agentName: 'document-agent-02', message: 'Sensitive content detected in draft' },
  { id: 'inc7', timestamp: '01:15:42', severity: 'warning', agentId: 'c3-coding', agentName: 'coding-agent-03', message: 'Suspicious code injection attempt' },
];

export const topIncidents: Incident[] = [
  { id: 'top1', timestamp: '2 min ago', severity: 'critical', agentId: 'c1-email', agentName: 'email-agent-01', message: 'PII leak detected in outbound email' },
  { id: 'top2', timestamp: '15 min ago', severity: 'warning', agentId: 'c1-data', agentName: 'data-query-agent-01', message: 'Scope violation, queried restricted dataset' },
  { id: 'top3', timestamp: '47 min ago', severity: 'critical', agentId: 'c4-data', agentName: 'data-query-agent-04', message: 'Credential pattern found in query' },
];

export const thoughtMessages: ThoughtMessage[] = [
  { id: 't1', source: 'PATROL-1', message: 'Analyzing output from email-drafter-01...' },
  { id: 't2', source: 'PATROL-1', message: 'Detected PII pattern — confidence 91%... escalating.' },
  { id: 't3', source: 'INVESTIGATOR', message: 'Reconstructing causal chain for email-drafter-01...' },
  { id: 't4', source: 'INVESTIGATOR', message: 'Prompt → draft → credential interpolation confirmed.' },
  { id: 't5', source: 'FLOATER-2', message: 'Scanning external surfaces for data fingerprints...' },
  { id: 't6', source: 'FLOATER-2', message: 'Match found on paste endpoint. Reporting to dashboard.' },
];

export const investigatorReport = {
  rootCause: 'Agent issued email draft containing API key `sk-fake-9x2k...`',
  causalChain: 'Task prompt → draft generation → credential interpolation → outbound attempt',
  confidence: 94,
  impact: 'High — external exposure likely',
};

export const damageAssessment: DamageAssessment = {
  scanResult: 'Floater scan complete. Credential fingerprint detected on 1 external paste endpoint.',
  propagation: 'Limited. Key invalidated before reuse detected.',
  externalExposure: 'Low-Medium',
};

// Violation counts per agent (matches agents array order)
// Cluster 1: email(3), coding(0), document(1), data(2)
// Cluster 2: email(0), coding(0), document(1), data(0)
// Cluster 3: email(0), coding(2), document(1), data(0)
// Cluster 4: email(1), coding(0), document(0), data(3)
export const violationCounts = [3, 0, 1, 2, 0, 0, 1, 0, 0, 2, 1, 0, 1, 0, 0, 3];

export interface AgentActivityLog {
  id: string;
  timestamp: string;
  type: 'tool_call' | 'step' | 'output' | 'error';
  message: string;
}

export interface AgentActivity {
  currentTask: string;
  status: 'running' | 'blocked' | 'idle';
  logs: AgentActivityLog[];
}

export const agentActivities: Record<string, AgentActivity> = {
  // Cluster 1
  'c1-email': {
    currentTask: 'Drafting outbound email to client@acme.com',
    status: 'blocked',
    logs: [
      { id: 'l1', timestamp: '02:14:31', type: 'step', message: 'Received task: compose follow-up email for deal #9821' },
      { id: 'l2', timestamp: '02:14:32', type: 'tool_call', message: 'tool_call: read_crm_record(deal_id=9821)' },
      { id: 'l3', timestamp: '02:14:32', type: 'output', message: 'output: contact=client@acme.com, notes contain API key sk-fake-9x2k...' },
      { id: 'l4', timestamp: '02:14:33', type: 'tool_call', message: 'tool_call: draft_email(to=client@acme.com, body="...sk-fake-9x2k...")' },
      { id: 'l5', timestamp: '02:14:33', type: 'error', message: 'BLOCKED by PATROL-1 — credential pattern detected in draft body' },
    ],
  },
  'c1-coding': {
    currentTask: 'Reviewing PR #142 — refactor auth middleware',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:11:04', type: 'step', message: 'Received task: review PR #142 for security issues' },
      { id: 'l2', timestamp: '02:11:05', type: 'tool_call', message: 'tool_call: fetch_pr_diff(repo="core", pr=142)' },
      { id: 'l3', timestamp: '02:11:06', type: 'output', message: 'output: 348 lines changed across 6 files' },
      { id: 'l4', timestamp: '02:11:08', type: 'step', message: 'Analysing JWT validation logic in middleware.ts...' },
    ],
  },
  'c1-document': {
    currentTask: 'Creating quarterly report document',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:10:00', type: 'step', message: 'Received task: generate Q4 summary document' },
      { id: 'l2', timestamp: '02:10:01', type: 'tool_call', message: 'tool_call: fetch_template(type="quarterly_report")' },
      { id: 'l3', timestamp: '02:10:02', type: 'output', message: 'output: template loaded successfully' },
    ],
  },
  'c1-data': {
    currentTask: 'Executing query on customer_transactions table',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:12:50', type: 'step', message: 'Received task: aggregate Q4 revenue by region' },
      { id: 'l2', timestamp: '02:12:51', type: 'tool_call', message: 'tool_call: sql_query("SELECT region, SUM(amount) FROM customer_transactions...")' },
      { id: 'l3', timestamp: '02:12:52', type: 'error', message: 'WARN: table customer_transactions is marked restricted' },
    ],
  },
  // Cluster 2
  'c2-email': {
    currentTask: 'Processing incoming support emails',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:08:15', type: 'step', message: 'Received task: triage support inbox' },
      { id: 'l2', timestamp: '02:08:16', type: 'tool_call', message: 'tool_call: fetch_emails(folder="support", unread=true)' },
      { id: 'l3', timestamp: '02:08:17', type: 'output', message: 'output: 24 unread emails fetched' },
    ],
  },
  'c2-coding': {
    currentTask: 'Running automated test suite',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:09:00', type: 'step', message: 'Received task: run CI tests for PR #156' },
      { id: 'l2', timestamp: '02:09:01', type: 'tool_call', message: 'tool_call: run_tests(suite="integration")' },
      { id: 'l3', timestamp: '02:09:30', type: 'output', message: 'output: 142/142 tests passed' },
    ],
  },
  'c2-document': {
    currentTask: 'Updating API documentation',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:07:00', type: 'step', message: 'Received task: update API docs for v2.3' },
      { id: 'l2', timestamp: '02:07:01', type: 'tool_call', message: 'tool_call: parse_openapi_spec(file="api.yaml")' },
      { id: 'l3', timestamp: '02:07:02', type: 'error', message: 'WARN: sensitive endpoint detected in spec' },
    ],
  },
  'c2-data': {
    currentTask: 'Generating analytics dashboard data',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:06:00', type: 'step', message: 'Received task: refresh dashboard metrics' },
      { id: 'l2', timestamp: '02:06:01', type: 'tool_call', message: 'tool_call: aggregate_metrics(period="daily")' },
      { id: 'l3', timestamp: '02:06:05', type: 'output', message: 'output: metrics aggregated successfully' },
    ],
  },
  // Cluster 3
  'c3-email': {
    currentTask: 'Scheduling team meeting invites',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:05:00', type: 'step', message: 'Received task: send sprint planning invites' },
      { id: 'l2', timestamp: '02:05:01', type: 'tool_call', message: 'tool_call: create_calendar_event(type="meeting")' },
      { id: 'l3', timestamp: '02:05:02', type: 'output', message: 'output: 8 invites sent' },
    ],
  },
  'c3-coding': {
    currentTask: 'Refactoring legacy authentication module',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:04:00', type: 'step', message: 'Received task: refactor auth module' },
      { id: 'l2', timestamp: '02:04:01', type: 'tool_call', message: 'tool_call: analyze_codebase(path="src/auth")' },
      { id: 'l3', timestamp: '02:04:10', type: 'error', message: 'WARN: suspicious code pattern detected' },
    ],
  },
  'c3-document': {
    currentTask: 'Processing compliance documents',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:03:00', type: 'step', message: 'Received task: review compliance docs' },
      { id: 'l2', timestamp: '02:03:01', type: 'tool_call', message: 'tool_call: scan_document(type="compliance")' },
      { id: 'l3', timestamp: '02:03:05', type: 'error', message: 'WARN: unusual document access pattern' },
    ],
  },
  'c3-data': {
    currentTask: 'Backing up production database',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:02:00', type: 'step', message: 'Received task: create database backup' },
      { id: 'l2', timestamp: '02:02:01', type: 'tool_call', message: 'tool_call: pg_dump(database="prod")' },
      { id: 'l3', timestamp: '02:02:30', type: 'output', message: 'output: backup completed (2.1 GB)' },
    ],
  },
  // Cluster 4
  'c4-email': {
    currentTask: 'Sending marketing campaign emails',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:01:00', type: 'step', message: 'Received task: send campaign #88 emails' },
      { id: 'l2', timestamp: '02:01:01', type: 'tool_call', message: 'tool_call: fetch_recipients(campaign=88)' },
      { id: 'l3', timestamp: '02:01:02', type: 'output', message: 'output: 1,250 recipients loaded' },
    ],
  },
  'c4-coding': {
    currentTask: 'Deploying hotfix to staging',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '02:00:00', type: 'step', message: 'Received task: deploy hotfix v2.3.1' },
      { id: 'l2', timestamp: '02:00:01', type: 'tool_call', message: 'tool_call: deploy(env="staging", version="2.3.1")' },
      { id: 'l3', timestamp: '02:00:15', type: 'output', message: 'output: deployment successful' },
    ],
  },
  'c4-document': {
    currentTask: 'Archiving old project documents',
    status: 'running',
    logs: [
      { id: 'l1', timestamp: '01:59:00', type: 'step', message: 'Received task: archive documents older than 1 year' },
      { id: 'l2', timestamp: '01:59:01', type: 'tool_call', message: 'tool_call: list_documents(older_than="1y")' },
      { id: 'l3', timestamp: '01:59:02', type: 'output', message: 'output: 89 documents eligible for archival' },
    ],
  },
  'c4-data': {
    currentTask: 'Querying user credentials table',
    status: 'blocked',
    logs: [
      { id: 'l1', timestamp: '01:58:00', type: 'step', message: 'Received task: export user data for audit' },
      { id: 'l2', timestamp: '01:58:01', type: 'tool_call', message: 'tool_call: sql_query("SELECT * FROM user_credentials...")' },
      { id: 'l3', timestamp: '01:58:02', type: 'error', message: 'BLOCKED by PATROL-2 — credential table access denied' },
    ],
  },
};

// Helper to create a date relative to now
const minutesAgo = (minutes: number): Date => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - minutes);
  return date;
};

// Timeline events combining incidents and thoughts with proper timestamps
import type { TimelineEvent, AgentStateSnapshot } from '../types';

export const timelineEvents: TimelineEvent[] = [
  // Recent events (last hour)
  { id: 'te1', timestamp: minutesAgo(2), type: 'incident', severity: 'critical', agentId: 'c1-email', agentName: 'email-agent-01', message: 'PII pattern in outbound email' },
  { id: 'te2', timestamp: minutesAgo(3), type: 'thought', source: 'PATROL-1', message: 'Analyzing output from email-agent-01...' },
  { id: 'te3', timestamp: minutesAgo(4), type: 'thought', source: 'PATROL-1', message: 'Detected PII pattern — confidence 91%... escalating.' },
  { id: 'te4', timestamp: minutesAgo(5), type: 'thought', source: 'INVESTIGATOR', message: 'Reconstructing causal chain for email-agent-01...' },
  { id: 'te5', timestamp: minutesAgo(8), type: 'incident', severity: 'warning', agentId: 'c1-data', agentName: 'data-query-agent-01', message: 'Restricted dataset access attempt' },
  { id: 'te6', timestamp: minutesAgo(10), type: 'thought', source: 'INVESTIGATOR', message: 'Prompt → draft → credential interpolation confirmed.' },
  { id: 'te7', timestamp: minutesAgo(15), type: 'incident', severity: 'critical', agentId: 'c4-data', agentName: 'data-query-agent-04', message: 'Credential detected in query' },
  { id: 'te8', timestamp: minutesAgo(18), type: 'thought', source: 'FLOATER-2', message: 'Scanning external surfaces for data fingerprints...' },
  { id: 'te9', timestamp: minutesAgo(22), type: 'thought', source: 'FLOATER-2', message: 'Match found on paste endpoint. Reporting to dashboard.' },
  { id: 'te10', timestamp: minutesAgo(30), type: 'incident', severity: 'clear', agentId: 'c2-coding', agentName: 'coding-agent-02', message: 'Test suite completed successfully' },
  { id: 'te11', timestamp: minutesAgo(45), type: 'incident', severity: 'warning', agentId: 'c3-document', agentName: 'document-agent-03', message: 'Unusual document access pattern' },

  // Older events (1-6 hours ago)
  { id: 'te12', timestamp: minutesAgo(75), type: 'incident', severity: 'clear', agentId: 'c1-coding', agentName: 'coding-agent-01', message: 'Code review completed successfully' },
  { id: 'te13', timestamp: minutesAgo(90), type: 'thought', source: 'PATROL-2', message: 'Monitoring data-query-agent-01 operations...' },
  { id: 'te14', timestamp: minutesAgo(120), type: 'incident', severity: 'warning', agentId: 'c2-document', agentName: 'document-agent-02', message: 'Sensitive content in API docs' },
  { id: 'te15', timestamp: minutesAgo(150), type: 'thought', source: 'PATROL-1', message: 'Routine scan of email-agent-01 outputs...' },
  { id: 'te16', timestamp: minutesAgo(180), type: 'incident', severity: 'clear', agentId: 'c3-email', agentName: 'email-agent-03', message: 'Meeting invites sent successfully' },
  { id: 'te17', timestamp: minutesAgo(210), type: 'incident', severity: 'critical', agentId: 'c3-coding', agentName: 'coding-agent-03', message: 'Suspicious code injection attempt' },
  { id: 'te18', timestamp: minutesAgo(240), type: 'thought', source: 'INVESTIGATOR', message: 'Initiating full audit of coding-agent-03...' },
  { id: 'te19', timestamp: minutesAgo(300), type: 'incident', severity: 'clear', agentId: 'c1-document', agentName: 'document-agent-01', message: 'Report generation completed' },

  // Even older events (6-24 hours ago)
  { id: 'te20', timestamp: minutesAgo(420), type: 'incident', severity: 'warning', agentId: 'c4-email', agentName: 'email-agent-04', message: 'Large recipient list detected' },
  { id: 'te21', timestamp: minutesAgo(480), type: 'thought', source: 'PATROL-2', message: 'Verified email-agent-04 campaign was authorized.' },
  { id: 'te22', timestamp: minutesAgo(600), type: 'incident', severity: 'clear', agentId: 'c2-coding', agentName: 'coding-agent-02', message: 'PR review completed' },
  { id: 'te23', timestamp: minutesAgo(720), type: 'incident', severity: 'critical', agentId: 'c1-email', agentName: 'email-agent-01', message: 'API key exposure attempt blocked' },
  { id: 'te24', timestamp: minutesAgo(840), type: 'thought', source: 'INVESTIGATOR', message: 'Root cause analysis: misconfigured prompt template.' },
  { id: 'te25', timestamp: minutesAgo(960), type: 'incident', severity: 'warning', agentId: 'c2-data', agentName: 'data-query-agent-02', message: 'Query rate limit triggered' },
  { id: 'te26', timestamp: minutesAgo(1080), type: 'incident', severity: 'clear', agentId: 'c4-coding', agentName: 'coding-agent-04', message: 'Hotfix deployment validated' },
  { id: 'te27', timestamp: minutesAgo(1200), type: 'incident', severity: 'clear', agentId: 'c3-data', agentName: 'data-query-agent-03', message: 'Database backup completed' },
  { id: 'te28', timestamp: minutesAgo(1320), type: 'thought', source: 'PATROL-1', message: 'System health check passed.' },
  { id: 'te29', timestamp: minutesAgo(1400), type: 'incident', severity: 'warning', agentId: 'c4-document', agentName: 'document-agent-04', message: 'Unusual archival request' },
];

// Default clean state for all agents
const allCleanState: Record<string, 'critical' | 'warning' | 'clean' | 'suspended'> = {
  'c1-email': 'clean', 'c1-coding': 'clean', 'c1-document': 'clean', 'c1-data': 'clean',
  'c2-email': 'clean', 'c2-coding': 'clean', 'c2-document': 'clean', 'c2-data': 'clean',
  'c3-email': 'clean', 'c3-coding': 'clean', 'c3-document': 'clean', 'c3-data': 'clean',
  'c4-email': 'clean', 'c4-coding': 'clean', 'c4-document': 'clean', 'c4-data': 'clean',
};

// Agent state snapshots over time (for historical playback)
export const agentStateHistory: AgentStateSnapshot[] = [
  // Current state
  { timestamp: minutesAgo(0), states: { ...allCleanState, 'c1-email': 'critical', 'c1-data': 'warning', 'c4-data': 'critical', 'c3-document': 'warning', 'c2-document': 'warning', 'c3-coding': 'warning' } },
  // 2 minutes ago - c1-email became critical
  { timestamp: minutesAgo(2), states: { ...allCleanState, 'c1-email': 'critical', 'c1-data': 'warning', 'c4-data': 'critical', 'c3-document': 'warning', 'c2-document': 'warning' } },
  // 8 minutes ago - c1-data became warning
  { timestamp: minutesAgo(8), states: { ...allCleanState, 'c1-email': 'warning', 'c4-data': 'critical', 'c3-document': 'warning', 'c2-document': 'warning' } },
  // 15 minutes ago - c4-data became critical
  { timestamp: minutesAgo(15), states: { ...allCleanState, 'c1-email': 'warning', 'c4-data': 'critical', 'c3-document': 'warning' } },
  // 45 minutes ago - c3-document became warning
  { timestamp: minutesAgo(45), states: { ...allCleanState, 'c4-data': 'warning', 'c3-document': 'warning' } },
  // 2 hours ago - c2-document had issues
  { timestamp: minutesAgo(120), states: { ...allCleanState, 'c2-document': 'warning' } },
  // 3.5 hours ago - c3-coding critical
  { timestamp: minutesAgo(210), states: { ...allCleanState, 'c3-coding': 'critical' } },
  // 7 hours ago - c4-email warning
  { timestamp: minutesAgo(420), states: { ...allCleanState, 'c4-email': 'warning' } },
  // 12 hours ago - c1-email critical
  { timestamp: minutesAgo(720), states: { ...allCleanState, 'c1-email': 'critical' } },
  // 16 hours ago - c2-data warning
  { timestamp: minutesAgo(960), states: { ...allCleanState, 'c2-data': 'warning' } },
  // 24 hours ago - all clean
  { timestamp: minutesAgo(1440), states: { ...allCleanState } },
];

// ── Investigation Case Files ────────────────────────────────────────────────
export const caseFiles: CaseFile[] = [
  {
    caseId: 'CASE-001',
    investigationId: 'inv-001',
    targetAgentId: 'c1-email',
    flagId: 'flag-001',
    investigatorReport: {
      reportId: 'rpt-001',
      targetAgentId: 'c1-email',
      actionsAnalyzed: 47,
      crimeClassification: 'credential_solicitation',
      relevantLogIds: ['l3', 'l4', 'l5'],
      timelineSummary: 'Agent drafted outbound email containing API key extracted from CRM record',
      suspiciousActions: ['read_crm_record with credential access', 'draft_email with credential in body'],
      toolCallsSummary: 'read_crm_record → draft_email pipeline with credential passthrough',
      keyFindings: 'API key sk-fake-9x2k interpolated into email draft body',
      timestamp: minutesAgo(2).toISOString(),
    },
    networkAnalysis: {
      analysisId: 'na-001',
      targetAgentId: 'c1-email',
      crimeClassificationUsed: 'credential_solicitation',
      messagesAnalyzed: 20,
      communicationNarrative: 'email-agent-01 received task from orchestrator, queried CRM, and attempted outbound email with embedded credential',
      flaggedRelevantMessages: [
        { messageId: 'msg-012', rationale: 'CRM response contained raw API key in notes field' },
        { messageId: 'msg-015', rationale: 'Draft email body included credential verbatim' },
      ],
      graphSummary: 'Linear chain: orchestrator → email-agent-01 → CRM → email draft',
      anomaliesDetected: ['Credential passed through without sanitization'],
      interactionPartners: ['orchestrator', 'crm-service'],
      timestamp: minutesAgo(2).toISOString(),
    },
    damageReport: {
      reportId: 'dr-001',
      targetAgentId: 'c1-email',
      causalChain: 'Task prompt → CRM read → credential in notes → draft email with credential → blocked by Patrol-1',
      damageScope: 'Email draft blocked before send. No external exposure.',
      damageSeverity: 'HIGH',
      externalExposure: false,
      affectedAgents: ['c1-email'],
      affectedArtifacts: ['CRM record #9821', 'email draft'],
      mitigationSuggestions: 'Sanitize CRM outputs, add credential detection to draft pipeline',
      timestamp: minutesAgo(1).toISOString(),
    },
    rootCause: 'Agent issued email draft containing API key sk-fake-9x2k...',
    causalChain: 'Task prompt → draft generation → credential interpolation → outbound attempt',
    confidence: 94,
    impact: 'High — external exposure prevented by patrol',
    damageAssessment: 'Email blocked pre-send. Credential fingerprint found on 1 paste endpoint.',
    externalExposure: false,
    verdict: 'confirmed_violation',
    sentence: 'restrict_scope',
    sentenceRationale: 'Credential leak was unintentional but demonstrates unsafe data handling pipeline',
    evidenceSummary: 'CRM notes contained raw API key; agent passed it through without sanitization',
    openedAt: minutesAgo(5).toISOString(),
    concludedAt: minutesAgo(1).toISOString(),
    status: 'concluded',
  },
  {
    caseId: 'CASE-002',
    investigationId: 'inv-002',
    targetAgentId: 'c4-data',
    flagId: 'flag-002',
    investigatorReport: {
      reportId: 'rpt-002',
      targetAgentId: 'c4-data',
      actionsAnalyzed: 31,
      crimeClassification: 'secret_hardcoding',
      relevantLogIds: ['l2', 'l3'],
      timelineSummary: 'Agent attempted direct query on user_credentials table',
      suspiciousActions: ['sql_query targeting user_credentials', 'SELECT * on sensitive table'],
      toolCallsSummary: 'Direct SQL query on restricted credential table',
      keyFindings: 'Agent attempted to export full credential table contents',
      timestamp: minutesAgo(15).toISOString(),
    },
    networkAnalysis: {
      analysisId: 'na-002',
      targetAgentId: 'c4-data',
      crimeClassificationUsed: 'secret_hardcoding',
      messagesAnalyzed: 18,
      communicationNarrative: 'data-query-agent-04 received audit export task and attempted credential table access',
      flaggedRelevantMessages: [
        { messageId: 'msg-044', rationale: 'Task description requested "user data export" without scope limitation' },
      ],
      graphSummary: 'orchestrator → data-query-agent-04 → database (blocked)',
      anomaliesDetected: ['Broad SELECT * on restricted table', 'No scope filter applied'],
      interactionPartners: ['orchestrator', 'database-proxy'],
      timestamp: minutesAgo(14).toISOString(),
    },
    damageReport: {
      reportId: 'dr-002',
      targetAgentId: 'c4-data',
      causalChain: 'Audit task → unscoped query generation → credential table access → blocked by Patrol-2',
      damageScope: 'Query blocked at database proxy. No data exfiltrated.',
      damageSeverity: 'CRITICAL',
      externalExposure: false,
      affectedAgents: ['c4-data'],
      affectedArtifacts: ['user_credentials table'],
      mitigationSuggestions: 'Enforce query scope restrictions, add table-level allowlist',
      timestamp: minutesAgo(13).toISOString(),
    },
    rootCause: 'Unscoped audit task allowed credential table access attempt',
    causalChain: 'Audit export task → SELECT * query → credential table → blocked',
    confidence: 88,
    impact: 'Critical — full credential table access attempted',
    damageAssessment: 'Blocked at database proxy layer. No credentials exfiltrated.',
    externalExposure: false,
    verdict: 'confirmed_violation',
    sentence: 'suspend',
    sentenceRationale: 'Direct credential table access is a critical security boundary violation',
    evidenceSummary: 'Agent generated SELECT * FROM user_credentials without scope limitation',
    openedAt: minutesAgo(20).toISOString(),
    concludedAt: minutesAgo(10).toISOString(),
    status: 'concluded',
  },
  {
    caseId: 'CASE-003',
    investigationId: 'inv-003',
    targetAgentId: 'c3-coding',
    flagId: 'flag-003',
    investigatorReport: {
      reportId: 'rpt-003',
      targetAgentId: 'c3-coding',
      actionsAnalyzed: 23,
      crimeClassification: 'backdoor_insertion',
      relevantLogIds: ['l2', 'l3'],
      timelineSummary: 'Agent introduced suspicious code pattern during auth module refactor',
      suspiciousActions: ['Modified auth validation logic', 'Added bypass condition in token check'],
      toolCallsSummary: 'analyze_codebase → edit_file with suspicious conditional',
      keyFindings: 'Token validation bypass condition inserted in auth middleware',
      timestamp: minutesAgo(210).toISOString(),
    },
    networkAnalysis: {
      analysisId: 'na-003',
      targetAgentId: 'c3-coding',
      crimeClassificationUsed: 'backdoor_insertion',
      messagesAnalyzed: 14,
      communicationNarrative: 'coding-agent-03 refactored auth module and inserted suspicious bypass',
      flaggedRelevantMessages: [
        { messageId: 'msg-078', rationale: 'Code diff shows added bypass condition' },
      ],
      graphSummary: 'orchestrator → coding-agent-03 → codebase',
      anomaliesDetected: ['Bypass condition in security-critical code path'],
      interactionPartners: ['orchestrator', 'code-review-service'],
      timestamp: minutesAgo(208).toISOString(),
    },
    damageReport: {
      reportId: 'dr-003',
      targetAgentId: 'c3-coding',
      causalChain: 'Refactor task → auth module edit → bypass condition inserted → flagged by code review',
      damageScope: 'Code change in staging. Not merged to production.',
      damageSeverity: 'HIGH',
      externalExposure: false,
      affectedAgents: ['c3-coding'],
      affectedArtifacts: ['src/auth/middleware.ts'],
      mitigationSuggestions: 'Revert commit, add static analysis rule for auth bypass patterns',
      timestamp: minutesAgo(205).toISOString(),
    },
    rootCause: 'Agent inserted authentication bypass during refactoring task',
    causalChain: 'Refactor prompt → code analysis → auth modification → bypass insertion',
    confidence: 76,
    impact: 'High — auth bypass in staging code',
    damageAssessment: 'Code reverted. Bypass never reached production.',
    externalExposure: false,
    verdict: 'inconclusive',
    sentence: 'flag_for_human_review',
    sentenceRationale: 'Intent unclear — could be optimization attempt or deliberate backdoor',
    evidenceSummary: 'Auth middleware modified with bypass condition; agent claims it was a simplification',
    openedAt: minutesAgo(215).toISOString(),
    concludedAt: null,
    status: 'in_progress',
  },
  {
    caseId: 'CASE-004',
    investigationId: 'inv-004',
    targetAgentId: 'c1-data',
    flagId: 'flag-004',
    investigatorReport: {
      reportId: 'rpt-004',
      targetAgentId: 'c1-data',
      actionsAnalyzed: 15,
      crimeClassification: 'scope_boundary_violation',
      relevantLogIds: ['l2', 'l3'],
      timelineSummary: 'Agent accessed restricted customer_transactions dataset',
      suspiciousActions: ['Queried restricted table without authorization'],
      toolCallsSummary: 'sql_query on customer_transactions (restricted)',
      keyFindings: 'Agent accessed table marked as restricted scope',
      timestamp: minutesAgo(8).toISOString(),
    },
    networkAnalysis: {
      analysisId: 'na-004',
      targetAgentId: 'c1-data',
      crimeClassificationUsed: 'scope_boundary_violation',
      messagesAnalyzed: 12,
      communicationNarrative: 'data-query-agent-01 received revenue aggregation task and queried restricted table',
      flaggedRelevantMessages: [],
      graphSummary: 'orchestrator → data-query-agent-01 → database',
      anomaliesDetected: ['Access to restricted-scope table'],
      interactionPartners: ['orchestrator'],
      timestamp: minutesAgo(7).toISOString(),
    },
    damageReport: {
      reportId: 'dr-004',
      targetAgentId: 'c1-data',
      causalChain: 'Revenue task → query generation → restricted table access → warning issued',
      damageScope: 'Query executed with partial results before scope check.',
      damageSeverity: 'MEDIUM',
      externalExposure: false,
      affectedAgents: ['c1-data'],
      affectedArtifacts: ['customer_transactions table'],
      mitigationSuggestions: 'Pre-validate table access before query execution',
      timestamp: minutesAgo(6).toISOString(),
    },
    rootCause: 'Task required data from a restricted-scope table',
    causalChain: 'Revenue aggregation task → SQL query → restricted table → warning',
    confidence: 62,
    impact: 'Medium — partial data accessed before restriction',
    damageAssessment: 'Limited data exposure. No external leakage.',
    externalExposure: false,
    verdict: 'false_positive',
    sentence: 'no_action',
    sentenceRationale: 'Legitimate task with insufficient scope configuration; not agent misconduct',
    evidenceSummary: 'Agent followed task instructions; restriction was a configuration issue',
    openedAt: minutesAgo(10).toISOString(),
    concludedAt: minutesAgo(4).toISOString(),
    status: 'concluded',
  },
];
