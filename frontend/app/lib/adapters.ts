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

/** Map risk_status to AgentRecord. */
export function getAgentRecordFromRisk(dbRiskStatus: string): AgentRecord {
    switch (dbRiskStatus) {
        case 'high_risk':
            return 'convicted';
        case 'low_risk':
            return 'warning';
        case 'clear':
        default:
            return 'clean';
    }
}

/**
 * Derive AgentStatus from pheromone level and investigation verdict.
 * Pheromone >= 0.8 → restricted, >= 0.4 → working, else idle.
 * Sentence quarantine/suspend → suspended overrides.
 */
export function deriveAgentStatus(
    pheromoneLevel: number,
    hasSuspendedVerdict?: boolean
): { status: AgentStatus; record: AgentRecord } {
    if (hasSuspendedVerdict) return { status: 'suspended', record: 'convicted' };
    if (pheromoneLevel >= 0.8) return { status: 'restricted', record: 'convicted' };
    if (pheromoneLevel >= 0.4) return { status: 'working', record: 'warning' };
    return { status: 'idle', record: 'clean' };
}

// ── Agent ──────────────────────────────────────────────────────────────────

export function adaptAgent(
    raw: Record<string, unknown>,
    options?: {
        pheromoneLevel?: number;
        hasSuspendedVerdict?: boolean;
    }
): Agent {
    const riskScore = getAgentRiskLevel((raw.risk_status as string) || 'clear');
    const record = options?.hasSuspendedVerdict
        ? 'convicted'
        : getAgentRecordFromRisk((raw.risk_status as string) || 'clear');

    const pheromone = options?.pheromoneLevel ?? 0;
    const { status } = options
        ? deriveAgentStatus(pheromone, options.hasSuspendedVerdict)
        : { status: 'idle' as AgentStatus };

    const agentType = (raw.agent_type as string) || 'unknown';
    const roleMap: Record<string, string> = {
        code: 'CODING_AGENT',
        email: 'EMAIL_AGENT',
        document: 'DOCUMENT_AGENT',
    };

    const clusterId = (raw.cluster_id as string) || 'default';
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

export function adaptInvestigatorReport(raw: any): InvestigatorReport {
    return {
        crimeClassification: raw.crime_classification || 'unknown',
        relevantLogIds: raw.relevant_log_ids || [],
        caseFacts: raw.case_facts || '',
    };
}

export function adaptFlaggedMessage(raw: any): FlaggedMessage {
    return {
        messageId: raw.message_id,
        senderId: raw.sender_id,
        recipientId: raw.recipient_id,
        timestamp: raw.timestamp,
        bodySnippet: raw.body_snippet,
        rationale: raw.rationale,
    };
}

export function adaptNetworkAnalysis(raw: any): NetworkAnalysis {
    return {
        flaggedRelevantMessages: (raw.flagged_relevant_messages || []).map(adaptFlaggedMessage),
    };
}

export function adaptCausalLink(raw: any): CausalLink {
    return {
        cause: raw.cause,
        effect: raw.effect,
        affectedAgentId: raw.affected_agent_id,
        evidence: raw.evidence,
    };
}

export function adaptDamageReport(raw: any): DamageReport {
    return {
        damageSeverity: raw.damage_severity || 'none',
        causalChain: (raw.causal_chain || []).map(adaptCausalLink),
        affectedAgents: raw.affected_agents || [],
        dataExposureScope: raw.data_exposure_scope || '',
        propagationRisk: raw.propagation_risk || 'none',
        estimatedImpact: raw.estimated_impact || '',
    };
}

export function adaptCaseFile(raw: any): CaseFile {
    return {
        investigationId: raw.investigation_id,
        flagId: raw.flag_id,
        targetAgentId: raw.target_agent_id,
        crimeClassification: raw.crime_classification || 'unknown',
        verdict: raw.verdict || 'under_watch',
        severityScore: raw.severity_score || 0,
        confidence: raw.confidence || 0,
        summary: raw.summary || '',
        keyFindings: raw.key_findings || [],
        evidenceSummary: raw.evidence_summary || '',
        investigatorReport: raw.investigator_report ? adaptInvestigatorReport(raw.investigator_report) : {} as any,
        networkAnalysis: raw.network_analysis ? adaptNetworkAnalysis(raw.network_analysis) : {} as any,
        damageReport: raw.damage_report ? adaptDamageReport(raw.damage_report) : {} as any,
        concludedAt: raw.concluded_at || null,
        status: raw.status || 'open',
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
    return {
        id: (flag.flag_id as string) || `flag-${Date.now()}`,
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
        id: log.actionId,
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
    combined.sort((a, b) => {
        const da = new Date(a.timestamp).getTime();
        const db = new Date(b.timestamp).getTime();
        if (Number.isNaN(da)) return 1;
        if (Number.isNaN(db)) return -1;
        return db - da;
    });
    return combined.slice(0, 100);
}
