import { DetectionResult, Severity } from '@/types';

export interface RiskScoreDetails {
  score: number;
  confidence: number;
  severity: Severity;
  ruleBreakdown: Array<{
    rule_id: string;
    rule_name: string;
    contribution: number;
    reason: string;
  }>;
}

export class RiskScorer {
  /**
   * Computes an explainable score (0-100) and confidence (0-100)
   * without double counting overlapping rules on the exact same event IDs.
   */
  public static calculate(detections: DetectionResult[], totalIncidentEvents: number): RiskScoreDetails {
    if (!detections || detections.length === 0) {
      return {
        score: 0,
        confidence: 0,
        severity: 'LOW',
        ruleBreakdown: [],
      };
    }

    let rawScore = 0;
    const ruleBreakdown: RiskScoreDetails['ruleBreakdown'] = [];
    const creditedEventIds = new Set<string>();

    // Sort detections by contributing score descending so highest impact rules take precedence
    const sorted = [...detections].sort((a, b) => b.contributing_score - a.contributing_score);

    for (const det of sorted) {
      // Calculate how many new/uncredited events this detection introduces
      const newEvents = det.relevant_event_ids.filter((id) => !creditedEventIds.has(id));
      const overlapRatio = det.relevant_event_ids.length > 0
        ? (det.relevant_event_ids.length - newEvents.length) / det.relevant_event_ids.length
        : 0;

      // Attenuate subsequent overlapping rules on the same events to avoid inflating score
      const weightMultiplier = overlapRatio > 0.7 ? 0.35 : overlapRatio > 0.3 ? 0.65 : 1.0;
      const effectiveContribution = Math.round(det.contributing_score * weightMultiplier);

      rawScore += effectiveContribution;
      det.relevant_event_ids.forEach((id) => creditedEventIds.add(id));

      ruleBreakdown.push({
        rule_id: det.rule_id,
        rule_name: det.rule_name,
        contribution: effectiveContribution,
        reason: `${det.suggested_severity} alert (${det.contributing_score} base). Effective score: +${effectiveContribution} with ${Math.round(overlapRatio * 100)}% event overlap.`,
      });
    }

    // Clamp score to [0, 100]
    const finalScore = Math.min(100, Math.max(0, rawScore));

    // Calculate confidence based on evidence depth and variety
    // More distinct event records and distinct rule types increase confidence
    const ruleCount = detections.length;
    const evidenceDepth = Math.min(50, totalIncidentEvents * 5);
    const ruleDiversity = Math.min(50, ruleCount * 20);
    const confidence = Math.min(100, Math.round(evidenceDepth * 0.5 + ruleDiversity * 0.5));

    // Map score to severity
    const severity = this.mapScoreToSeverity(finalScore);

    return {
      score: finalScore,
      confidence,
      severity,
      ruleBreakdown,
    };
  }

  public static mapScoreToSeverity(score: number): Severity {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }
}
