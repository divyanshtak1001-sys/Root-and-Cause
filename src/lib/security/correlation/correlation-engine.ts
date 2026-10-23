import { NormalizedLogEvent, DetectionResult, Incident, IncidentStatus } from '@/types';
import { RiskScorer } from '@/lib/security/scoring/risk-scorer';

export interface CorrelationConfig {
  contextWindowMs: number; // default 45 mins (2,700,000 ms)
}

export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  contextWindowMs: 45 * 60 * 1000,
};

export class EventCorrelationEngine {
  private config: CorrelationConfig;

  constructor(config: Partial<CorrelationConfig> = {}) {
    this.config = { ...DEFAULT_CORRELATION_CONFIG, ...config };
  }

  /**
   * Correlates detection results and raw events into distinct, contextual incidents.
   */
  public correlate(
    events: NormalizedLogEvent[],
    detections: DetectionResult[],
    workspaceId: string = 'ws_default'
  ): Incident[] {
    if (detections.length === 0) {
      return [];
    }

    const eventMap = new Map<string, NormalizedLogEvent>();
    events.forEach((e) => eventMap.set(e.event_id, e));

    // Form clusters of detections based on entity overlap (username or IP) and temporal closeness
    const clusters: Array<{
      detections: DetectionResult[];
      eventIds: Set<string>;
      primaryUser?: string;
      primaryIp?: string;
      primaryHost?: string;
      firstSeen: number;
      lastSeen: number;
    }> = [];

    for (const det of detections) {
      const detEvents = det.relevant_event_ids
        .map((id) => eventMap.get(id))
        .filter((e): e is NormalizedLogEvent => Boolean(e));

      if (detEvents.length === 0) continue;

      const detFirstSeen = Math.min(...detEvents.map((e) => new Date(e.timestamp).getTime()));
      const detLastSeen = Math.max(...detEvents.map((e) => new Date(e.timestamp).getTime()));

      const users = new Set(detEvents.map((e) => e.username.toLowerCase()).filter((u) => u !== 'anonymous'));
      const ips = new Set(detEvents.map((e) => e.source_ip).filter((ip) => ip !== '0.0.0.0'));
      const hosts = new Set(detEvents.map((e) => e.host).filter((h) => h !== 'unknown-host'));

      // Check if this detection belongs to an existing cluster
      const matchedCluster = clusters.find((cluster) => {
        const timeOverlap =
          detFirstSeen <= cluster.lastSeen + this.config.contextWindowMs &&
          detLastSeen >= cluster.firstSeen - this.config.contextWindowMs;

        if (!timeOverlap) return false;

        // Check if user or IP matches
        const hasMatchingUser = Array.from(users).some((u) => cluster.primaryUser?.toLowerCase() === u);
        const hasMatchingIp = Array.from(ips).some((ip) => cluster.primaryIp === ip);

        return hasMatchingUser || hasMatchingIp;
      });

      if (matchedCluster) {
        matchedCluster.detections.push(det);
        det.relevant_event_ids.forEach((id) => matchedCluster!.eventIds.add(id));
        matchedCluster.firstSeen = Math.min(matchedCluster.firstSeen, detFirstSeen);
        matchedCluster.lastSeen = Math.max(matchedCluster.lastSeen, detLastSeen);
        if (!matchedCluster.primaryUser && users.size > 0) {
          matchedCluster.primaryUser = Array.from(users)[0];
        }
        if (!matchedCluster.primaryIp && ips.size > 0) {
          matchedCluster.primaryIp = Array.from(ips)[0];
        }
        if (!matchedCluster.primaryHost && hosts.size > 0) {
          matchedCluster.primaryHost = Array.from(hosts)[0];
        }
      } else {
        clusters.push({
          detections: [det],
          eventIds: new Set(det.relevant_event_ids),
          primaryUser: users.size > 0 ? Array.from(users)[0] : undefined,
          primaryIp: ips.size > 0 ? Array.from(ips)[0] : undefined,
          primaryHost: hosts.size > 0 ? Array.from(hosts)[0] : undefined,
          firstSeen: detFirstSeen,
          lastSeen: detLastSeen,
        });
      }
    }

    // Expand each cluster with surrounding contextual events (same user or same IP within time window)
    const incidents: Incident[] = clusters.map((cluster) => {
      // Find all events in window involving the primary entities
      events.forEach((ev) => {
        const evTime = new Date(ev.timestamp).getTime();
        const isInTimeWindow =
          evTime >= cluster.firstSeen - this.config.contextWindowMs &&
          evTime <= cluster.lastSeen + this.config.contextWindowMs;

        if (isInTimeWindow) {
          const userMatches = cluster.primaryUser && ev.username.toLowerCase() === cluster.primaryUser.toLowerCase();
          const ipMatches = cluster.primaryIp && ev.source_ip === cluster.primaryIp;
          if (userMatches || ipMatches) {
            cluster.eventIds.add(ev.event_id);
          }
        }
      });

      const sortedEventIds = Array.from(cluster.eventIds).sort((a, b) => {
        const ea = eventMap.get(a);
        const eb = eventMap.get(b);
        const ta = ea ? new Date(ea.timestamp).getTime() : 0;
        const tb = eb ? new Date(eb.timestamp).getTime() : 0;
        return ta - tb;
      });

      const actualFirstSeen = sortedEventIds.length > 0 && eventMap.get(sortedEventIds[0])
        ? eventMap.get(sortedEventIds[0])!.timestamp
        : new Date(cluster.firstSeen).toISOString();

      const actualLastSeen = sortedEventIds.length > 0 && eventMap.get(sortedEventIds[sortedEventIds.length - 1])
        ? eventMap.get(sortedEventIds[sortedEventIds.length - 1])!.timestamp
        : new Date(cluster.lastSeen).toISOString();

      // Deterministic incident ID calculation based on entity + start timestamp
      const stableSeed = `${cluster.primaryUser || 'actor'}_${cluster.primaryIp || 'origin'}_${Math.floor(cluster.firstSeen / 3600000)}`;
      const hash = this.simpleHash(stableSeed);
      const incidentId = `inc_${Math.abs(hash).toString(36).padStart(6, '0')}`;

      // Calculate score and severity
      const scoreResult = RiskScorer.calculate(cluster.detections, sortedEventIds.length);

      const title = this.generateIncidentTitle(cluster.detections, cluster.primaryUser, cluster.primaryIp);
      const summary = this.generateIncidentSummary(cluster.detections, cluster.primaryUser, cluster.primaryIp, sortedEventIds.length);

      const incident: Incident = {
        id: incidentId,
        workspace_id: workspaceId,
        title,
        severity: scoreResult.severity,
        risk_score: scoreResult.score,
        confidence: scoreResult.confidence,
        status: 'NEW' as IncidentStatus,
        summary,
        first_seen: actualFirstSeen,
        last_seen: actualLastSeen,
        primary_user: cluster.primaryUser,
        primary_ip: cluster.primaryIp,
        primary_host: cluster.primaryHost,
        event_count: sortedEventIds.length,
        event_ids: sortedEventIds,
        detections: cluster.detections,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return incident;
    });

    // Sort incidents by risk score descending
    return incidents.sort((a, b) => b.risk_score - a.risk_score);
  }

  private generateIncidentTitle(detections: DetectionResult[], user?: string, ip?: string): string {
    const hasSuccessAfterFail = detections.some((d) => d.rule_id === 'RULE_SUCCESS_AFTER_FAILURES');
    const hasPostCompromise = detections.some((d) => d.rule_id === 'RULE_SUSPICIOUS_POST_COMPROMISE');
    const hasSpray = detections.some((d) => d.rule_id === 'RULE_PASSWORD_SPRAY_IP');

    if (hasPostCompromise) {
      return `Potential Post-Compromise Activity for ${user || 'Account'} (${ip || 'External Source'})`;
    }
    if (hasSuccessAfterFail) {
      return `Suspicious Login & Potential Compromise on ${user || 'Account'} from ${ip || 'Source IP'}`;
    }
    if (hasSpray) {
      return `Distributed Password Spray Originating from ${ip || 'Source IP'}`;
    }
    return `Repeated Authentication Anomalies Detected for ${user || ip || 'Unknown Actor'}`;
  }

  private generateIncidentSummary(
    detections: DetectionResult[],
    user?: string,
    ip?: string,
    eventCount?: number
  ): string {
    const rulesList = detections.map((d) => d.rule_name).join('; ');
    return `Incident correlated from ${eventCount || detections.length} event records involving user '${user || 'N/A'}' and source IP '${ip || 'N/A'}'. Triggered security alerts: ${rulesList}.`;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }
}
