import {
    Agent,
    AgentStatus,
    AgentRecord,
    RiskLevel,
    InvestigatorReport,
    NetworkAnalysis,
    DamageReport,
    CaseFile,
    A2AMessage,
    AgentActionLog,
    Incident,
    FlaggedMessage,
    CausalLink,
} from '../types';

// ── Helpers for Status, Record, and Risk Level Derivation ───────────────────

export function getAgentRiskLevel(dbRecord: string): RiskLevel {
    switch (dbRecord) {
        case 'high_risk':
            return 'high';
        case 'low_risk':
            return 'low';
        case 'clear':
        default:
            return 'normal';
    }
}

/** Ensure raw record from bridge_db is valid AgentRecord. Bridge DB returns clear | low_risk | high_risk. */
function normalizeAgentRecord(raw: string): AgentRecord {
    if (raw === 'high_risk' || raw === 'low_risk' || raw === 'clear') return raw;
    return 'clear';
}

/** Ensure raw status from bridge_db is valid AgentStatus. */
function normalizeAgentStatus(raw: string): AgentStatus {
    if (raw === 'working' || raw === 'idle' || raw === 'restricted' || raw === 'suspended') return raw;
    return 'idle';
}

/**
 * Derive AgentStatus from pheromone level and investigation verdict.
 * Pheromone >= 0.8 → restricted, >= 0.4 → working, else idle.
 * Sentence quarantine/suspend → suspended overrides.
 */
export function deriveAgentStatus(
    pheromoneLevel: number,
    hasSuspendedVerdict?: boolean,
    baseStatus: AgentStatus = 'idle'
): AgentStatus {
    if (hasSuspendedVerdict) return 'suspended';
    if (pheromoneLevel >= 0.8) return 'restricted';
    if (pheromoneLevel >= 0.4) return 'working';
    return baseStatus;
}

// ── Agent ──────────────────────────────────────────────────────────────────

export function adaptAgent(
    raw: Record<string, unknown>,
    options?: {
        pheromoneLevel?: number;
        hasSuspendedVerdict?: boolean;
    }
): Agent {
    // Bridge DB returns record (clear|low_risk|high_risk) and agent_status
    const dbRecord = normalizeAgentRecord((raw.record as string) || 'clear');
    const riskScore = getAgentRiskLevel(dbRecord);
    const record = dbRecord;

    const baseStatus = normalizeAgentStatus((raw.agent_status as string) || 'idle');
    const pheromone = options?.pheromoneLevel ?? 0;
    const status = options
        ? deriveAgentStatus(pheromone, options.hasSuspendedVerdict, baseStatus)
        : baseStatus;

    const agentType = (raw.agent_type as string) || 'unknown';
    const roleMap: Record<string, string> = {
        code: 'CODING_AGENT',
        email: 'EMAIL_AGENT',
        document: 'DOCUMENT_AGENT',
    };

    const rawCluster = (raw.cluster_id as string) || 'default';
    // Normalize cluster_1 -> cluster-1 so it matches room layout ids
    const clusterId = rawCluster.replace(/_/g, '-');
    return {
        id: (raw.agent_id as string) || '',
        name: (raw.name as string) || (raw.agent_id as string) || 'Unknown',
        role: roleMap[agentType] || agentType.toUpperCase(),
        status,
        record,
        riskScore,
        clusterId,
    } as Agent & { clusterId: string };
}

/** Convert Bridge DB agents dict to frontend Agent array with pheromone/verdict context. */
export function adaptAgentsList(
    agentsDict: Record<string, Record<string, unknown>>,
    pheromones?: Record<string, number>,
    suspendedAgentIds?: Set<string>
): Agent[] {
    return Object.entries(agentsDict).map(([agentId, raw]) => {
        const pheromoneLevel = pheromones?.[agentId] ?? 0;
        const hasSuspended = suspendedAgentIds?.has(agentId);
        return adaptAgent(
            { ...raw, agent_id: agentId },
            { pheromoneLevel, hasSuspendedVerdict: hasSuspended }
        );
    });
}

// ── Investigation Stages ───────────────────────────────────────────────────

// Backend schema uses snake_case (investigation/models.py).
// Seed data uses camelCase — both are handled via fallbacks.

export function adaptInvestigatorReport(raw: any): InvestigatorReport {
    return {
        // snake_case (backend) | camelCase (seed fallback)
        crimeClassification: raw.crime_classification ?? raw.crimeClassification ?? 'unknown',
        relevantLogIds:      raw.relevant_log_ids    ?? raw.relevantLogIds    ?? [],
        caseFacts:           raw.case_facts          ?? raw.caseFacts         ?? '',
    };
}

export function adaptFlaggedMessage(raw: any): FlaggedMessage {
    return {
        messageId:   raw.message_id   ?? raw.messageId,
        senderId:    raw.sender_id    ?? raw.senderId,
        recipientId: raw.recipient_id ?? raw.recipientId,
        timestamp:   raw.timestamp,
        bodySnippet: raw.body_snippet ?? raw.bodySnippet ?? '',
        rationale:   raw.rationale   ?? '',
    };
}

export function adaptNetworkAnalysis(raw: any): NetworkAnalysis {
    return {
        flaggedRelevantMessages: (raw.flagged_relevant_messages ?? raw.flaggedRelevantMessages ?? []).map(adaptFlaggedMessage),
    };
}

export function adaptCausalLink(raw: any): CausalLink {
    return {
        cause:           raw.cause,
        effect:          raw.effect,
        affectedAgentId: raw.affected_agent_id ?? raw.affectedAgentId,
        evidence:        raw.evidence ?? '',
    };
}

export function adaptDamageReport(raw: any): DamageReport {
    return {
        damageSeverity:    raw.damage_severity    ?? raw.damageSeverity    ?? 'none',
        causalChain:       (raw.causal_chain      ?? raw.causalChain       ?? []).map(adaptCausalLink),
        affectedAgents:    raw.affected_agents    ?? raw.affectedAgents    ?? [],
        dataExposureScope: raw.data_exposure_scope ?? raw.dataExposureScope ?? '',
        propagationRisk:   raw.propagation_risk   ?? raw.propagationRisk   ?? '',
        estimatedImpact:   raw.estimated_impact   ?? raw.estimatedImpact   ?? '',
    };
}

export function adaptCaseFile(raw: any): CaseFile {
    return {
        investigationId:   raw.investigation_id   ?? raw.investigationId,
        flagId:            raw.flag_id            ?? raw.flagId,
        targetAgentId:     raw.target_agent_id    ?? raw.targetAgentId,
        crimeClassification: raw.crime_classification ?? raw.crimeClassification ?? 'unknown',
        verdict:           raw.verdict            ?? 'under_watch',
        severityScore:     raw.severity_score     ?? raw.severityScore     ?? 0,
        confidence:        raw.confidence         ?? 0,
        summary:           raw.summary            ?? '',
        keyFindings:       raw.key_findings       ?? raw.keyFindings       ?? [],
        evidenceSummary:   raw.evidence_summary   ?? raw.evidenceSummary   ?? '',
        investigatorReport: (raw.investigator_report ?? raw.investigatorReport)
            ? adaptInvestigatorReport(raw.investigator_report ?? raw.investigatorReport)
            : { crimeClassification: 'unknown', relevantLogIds: [], caseFacts: '' },
        networkAnalysis: (raw.network_analysis ?? raw.networkAnalysis)
            ? adaptNetworkAnalysis(raw.network_analysis ?? raw.networkAnalysis)
            : { flaggedRelevantMessages: [] },
        damageReport: (raw.damage_report ?? raw.damageReport)
            ? adaptDamageReport(raw.damage_report ?? raw.damageReport)
            : { damageSeverity: 'none', causalChain: [], affectedAgents: [], dataExposureScope: '', propagationRisk: '', estimatedImpact: '' },
        concludedAt: raw.concluded_at ?? raw.concludedAt ?? null,
        // status lives on the DB row, not in CaseFile model — injected by useCaseFiles
        status: raw.status ?? 'open',
    };
}

// ── Bridge DB Logs ──────────────────────────────────────────────────────────

export function adaptA2AMessage(raw: any): A2AMessage {
    return {
        messageId: raw.message_id,
        senderId: raw.sender_id,
        recipientId: raw.recipient_id,
        timestamp: raw.timestamp,
        body: raw.body,
    };
}

export function adaptActionLog(raw: Record<string, unknown>): AgentActionLog {
    return {
        actionId: (raw.action_id as string) ?? '',
        agentId: (raw.agent_id as string) ?? '',
        actionType: (raw.action_type as string) ?? '',
        timestamp: (raw.timestamp as string) ?? '',
        toolName: (raw.tool_name as string) ?? null,
        inputSummary: (raw.input_summary as string) ?? '',
        outputSummary: (raw.output_summary as string) ?? '',
        violation: Boolean(raw.violation),
        violationType: (raw.violation_type as string) ?? null,
        critical: Boolean(raw.critical),
    };
}

// ── Incident synthesis ──────────────────────────────────────────────────────

/** Map PatrolFlag consensus_severity to Incident severity. */
function flagSeverityToIncident(sev: string): Incident['severity'] {
    if (sev === 'HIGH') return 'critical';
    if (sev === 'MEDIUM') return 'warning';
    return 'clear';
}

export function adaptIncidentFromFlag(
    flag: Record<string, unknown>,
    agentName?: string
): Incident {
    const ts = (flag.timestamp as string) || new Date().toISOString();
    const timeStr = ts.includes('T')
        ? new Date(ts).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        : ts;
    const rawId = (flag.flag_id as string) || `flag-${Date.now()}`;
    return {
        id: rawId.startsWith('flag-') ? rawId : `flag-${rawId}`,
        timestamp: timeStr,
        severity: flagSeverityToIncident((flag.consensus_severity as string) || 'LOW'),
        agentId: (flag.target_agent_id as string) || '',
        agentName: agentName || (flag.target_agent_id as string) || 'Unknown',
        message: (flag.referral_summary as string) || 'Patrol flag raised',
    };
}

export function adaptIncidentFromViolation(
    log: AgentActionLog,
    agentName?: string
): Incident {
    const ts = log.timestamp || new Date().toISOString();
    const timeStr = ts.includes('T')
        ? new Date(ts).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        })
        : ts;
    return {
        id: `violation-${log.actionId}`,
        timestamp: timeStr,
        severity: log.critical ? 'critical' : 'warning',
        agentId: log.agentId,
        agentName: agentName || log.agentId,
        message: log.outputSummary || log.inputSummary || 'Violation detected',
    };
}

/** Merge flags and violation logs into Incidents, sorted by timestamp (newest first). */
export function synthesizeIncidents(
    flags: Record<string, unknown>[],
    violationLogs: AgentActionLog[],
    agentNames?: Record<string, string>
): Incident[] {
    const fromFlags = flags.map((f) =>
        adaptIncidentFromFlag(f, agentNames?.[(f.target_agent_id as string) ?? ''])
    );
    const fromViolations = violationLogs.map((l) =>
        adaptIncidentFromViolation(l, agentNames?.[l.agentId])
    );
    const combined = [...fromFlags, ...fromViolations];
    const seen = new Set<string>();
    const deduped = combined.filter((inc) => {
        if (seen.has(inc.id)) return false;
        seen.add(inc.id);
        return true;
    });
    deduped.sort((a, b) => {
        const da = new Date(a.timestamp).getTime();
        const db = new Date(b.timestamp).getTime();
        if (Number.isNaN(da)) return 1;
        if (Number.isNaN(db)) return -1;
        return db - da;
    });
    return deduped.slice(0, 100);
}
