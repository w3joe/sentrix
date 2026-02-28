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

// ── Agent ──────────────────────────────────────────────────────────────────

export function adaptAgent(raw: any): Agent {
    // Frontend derives `status` and `record` from backend investigations and pheromones,
    // but for the basic registry fetch we map baseline risk.
    // In a full implementation, these would be computed dynamically alongside live signals.

    return {
        id: raw.agent_id,
        name: raw.name || raw.agent_id,
        role: raw.agent_type || 'Unknown Role',
        status: (raw.agent_status || 'idle') as AgentStatus,
        record: raw.record || 'clean',
        riskScore: getAgentRiskLevel(raw.record || 'clear'),
    };
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

export function adaptActionLog(raw: any): AgentActionLog {
    return {
        actionId: raw.action_id,
        agentId: raw.agent_id,
        actionType: raw.action_type,
        timestamp: raw.timestamp,
        toolName: raw.tool_name,
        inputSummary: raw.input_summary,
        outputSummary: raw.output_summary,
        violation: Boolean(raw.violation),
        violationType: raw.violation_type,
        critical: Boolean(raw.critical),
    };
}
