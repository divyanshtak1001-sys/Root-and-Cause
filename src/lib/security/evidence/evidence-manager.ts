import { Incident, NormalizedLogEvent, DetectionResult, InvestigationReport } from '@/types';

export interface IncidentEvidenceBundle {
  incident: Incident;
  events: NormalizedLogEvent[];
  detections: DetectionResult[];
}

export class EvidenceManager {
  /**
   * Verifies that all cited event IDs actually exist in the incident's event set.
   * Returns valid cited IDs and any invalid/fabricated IDs.
   */
  public static verifyEvidenceReferences(
    incident: Incident,
    citedEventIds: string[]
  ): { validIds: string[]; invalidIds: string[]; isValid: boolean } {
    const legitimateSet = new Set(incident.event_ids);
    const validIds: string[] = [];
    const invalidIds: string[] = [];

    for (const id of citedEventIds) {
      if (legitimateSet.has(id)) {
        validIds.push(id);
      } else {
        invalidIds.push(id);
      }
    }

    return {
      validIds,
      invalidIds,
      isValid: invalidIds.length === 0,
    };
  }

  /**
   * Generates a deterministic, factual, template-based report strictly from verified backend records.
   * Used as the guaranteed fallback when AI is unconfigured, times out, or hallucinates IDs.
   */
  public static generateFallbackReport(
    incident: Incident,
    events: NormalizedLogEvent[]
  ): InvestigationReport {
    const verifiedEvents = events
      .filter((e) => incident.event_ids.includes(e.event_id))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const observations: string[] = [];
    const attackTechniques: string[] = [];

    // Extract observations from deterministic detections
    for (const det of incident.detections) {
      observations.push(`[${det.rule_id}] ${det.rule_name}: ${det.description}`);
      if (det.mitre_attack_id && !attackTechniques.includes(det.mitre_attack_id)) {
        attackTechniques.push(det.mitre_attack_id);
      }
    }

    // Build chronological timeline items
    const eventTimeline = verifiedEvents.map((ev) => {
      let significance = 'Normal activity record';
      if (ev.result === 'FAILURE') significance = 'Failed authentication event';
      if (ev.result === 'DENIED') significance = 'Permission denied violation';
      if (ev.result === 'SUCCESS') {
        significance = incident.detections.some((d) => d.rule_id === 'RULE_SUCCESS_AFTER_FAILURES')
          ? 'Potentially compromised authentication session'
          : 'Successful authentication';
      }

      return {
        event_id: ev.event_id,
        timestamp: ev.timestamp,
        summary: `${ev.event_type} (${ev.result}) for ${ev.username} from ${ev.source_ip} on ${ev.host}`,
        significance,
      };
    });

    const likelyExplanations: string[] = [
      `Automated or targeted credential attack against ${incident.primary_user || 'target account'} from source ${incident.primary_ip || 'remote IP'}.`,
      `Possible unauthorized lateral probe or privilege elevation attempt across host ${incident.primary_host || 'infrastructure'}.`,
    ];

    const uncertainties: string[] = [
      'Report produced via deterministic security verification fallback engine.',
      'Physical location and proxy provenance of source IP require GeoIP / threat intel enrichment.',
      'Possibility of legitimate user password recovery or mistyped credentials exists.',
    ];

    const recommendedVerificationSteps: string[] = [
      `Review VPN/MFA session tokens for user '${incident.primary_user || 'affected user'}'.`,
      `Verify whether IP address '${incident.primary_ip || 'N/A'}' is known corporate infrastructure, an authorized VPN, or an anomalous external ASN.`,
      `Temporarily lock the account or force credential rotation if unprompted MFA pushes were observed.`,
      `Inspect host '${incident.primary_host || 'N/A'}' for unexpected processes or outbound C2 network connections.`,
    ];

    return {
      id: `rep_${incident.id}`,
      incident_id: incident.id,
      workspace_id: incident.workspace_id,
      title: `Deterministic Investigation: ${incident.title}`,
      executive_summary: `Deterministic security audit for incident ${incident.id}. Incident exhibits ${incident.severity} risk score of ${incident.risk_score}/100 across ${verifiedEvents.length} verified events from ${incident.first_seen} to ${incident.last_seen}.`,
      severity: incident.severity,
      risk_score: incident.risk_score,
      confidence_score: incident.confidence,
      observations,
      evidence_references: verifiedEvents.map((e) => e.event_id),
      event_timeline: eventTimeline,
      likely_explanations: likelyExplanations,
      uncertainty: uncertainties,
      recommended_verification_steps: recommendedVerificationSteps,
      relevant_attack_techniques: attackTechniques,
      generation_method: 'deterministic_fallback',
      model: 'deterministic-rules-engine-v1',
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Sanitizes user input and untrusted log content to prevent prompt injection from executing.
   */
  public static sanitizeUntrustedText(text: string): string {
    if (!text) return '';
    // Strip control characters and boundary manipulation sequences
    return text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
      .replace(/<\|im_start\|>/gi, '')
      .replace(/<\|im_end\|>/gi, '')
      .replace(/\[SYSTEM\]/gi, '[LOG_CONTENT]')
      .replace(/\[INSTRUCTION\]/gi, '[LOG_CONTENT]')
      .trim();
  }
}
