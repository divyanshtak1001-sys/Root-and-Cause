import { NormalizedLogEvent, DetectionResult, Severity } from '@/types';

export interface DetectionPolicyConfig {
  failedLoginThresholdUser: number; // default 4
  failedLoginThresholdWindowMs: number; // default 15 mins (900,000 ms)
  passwordSprayUserThreshold: number; // default 3 distinct users
  successAfterFailureThreshold: number; // default 3 failures
  successAfterFailureWindowMs: number; // default 30 mins (1,800,000 ms)
  accessDeniedThreshold: number; // default 3
  accessDeniedWindowMs: number; // default 15 mins
  postCompromiseWindowMs: number; // default 60 mins
}

export const DEFAULT_DETECTION_POLICY: DetectionPolicyConfig = {
  failedLoginThresholdUser: 4,
  failedLoginThresholdWindowMs: 15 * 60 * 1000,
  passwordSprayUserThreshold: 3,
  successAfterFailureThreshold: 3,
  successAfterFailureWindowMs: 30 * 60 * 1000,
  accessDeniedThreshold: 3,
  accessDeniedWindowMs: 15 * 60 * 1000,
  postCompromiseWindowMs: 60 * 60 * 1000,
};

/**
 * Deterministic detection engine that processes chronological security logs.
 */
export class SecurityDetectionEngine {
  private config: DetectionPolicyConfig;

  constructor(config: Partial<DetectionPolicyConfig> = {}) {
    this.config = { ...DEFAULT_DETECTION_POLICY, ...config };
  }

  public runDetections(events: NormalizedLogEvent[]): DetectionResult[] {
    // Ensure chronological order
    const sorted = [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const detections: DetectionResult[] = [];

    detections.push(...this.detectBruteForceUser(sorted));
    detections.push(...this.detectPasswordSprayIP(sorted));
    detections.push(...this.detectSuccessAfterFailures(sorted));
    detections.push(...this.detectRepeatedAccessDenied(sorted));
    detections.push(...this.detectSuspiciousPostCompromise(sorted));

    return detections;
  }

  /**
   * Rule 1: Repeated failed logins for same user/IP in window
   */
  private detectBruteForceUser(events: NormalizedLogEvent[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const userGroups = new Map<string, NormalizedLogEvent[]>();

    for (const event of events) {
      if (this.isLoginEvent(event) && event.result === 'FAILURE') {
        const key = `${event.username.toLowerCase()}::${event.source_ip}`;
        const group = userGroups.get(key) || [];
        group.push(event);
        userGroups.set(key, group);
      }
    }

    for (const [key, group] of userGroups.entries()) {
      const [username, ip] = key.split('::');
      // Sliding window check
      for (let i = 0; i < group.length; i++) {
        const windowStart = new Date(group[i].timestamp).getTime();
        const windowEvents = [group[i]];

        for (let j = i + 1; j < group.length; j++) {
          const t = new Date(group[j].timestamp).getTime();
          if (t - windowStart <= this.config.failedLoginThresholdWindowMs) {
            windowEvents.push(group[j]);
          } else {
            break;
          }
        }

        if (windowEvents.length >= this.config.failedLoginThresholdUser) {
          results.push({
            rule_id: 'RULE_BRUTE_FORCE_USER',
            rule_name: 'Repeated Failed Logins (Brute Force Attempt)',
            description: `Detected ${windowEvents.length} failed login attempts for user '${username}' from IP '${ip}' within ${Math.round(this.config.failedLoginThresholdWindowMs / 60000)} minutes.`,
            relevant_event_ids: windowEvents.map((e) => e.event_id),
            detection_timestamp: windowEvents[windowEvents.length - 1].timestamp,
            matched_conditions: {
              username,
              source_ip: ip,
              failed_attempts: windowEvents.length,
              time_window_minutes: Math.round(this.config.failedLoginThresholdWindowMs / 60000),
              threshold: this.config.failedLoginThresholdUser,
            },
            suggested_severity: 'HIGH',
            contributing_score: 35,
            mitre_attack_id: 'T1110.001',
            explanation: `Multiple failed authentication events in rapid succession suggest an automated credential guessing or brute force attack against user account '${username}'.`,
            limitations_or_false_positives: 'May be caused by a legitimate user who mistyped their password, an expired saved credential, or an unupdated service account.',
          });
          // Advance index past this window to avoid duplicate hits on the same cluster
          i += windowEvents.length - 1;
        }
      }
    }

    return results;
  }

  /**
   * Rule 2: Multiple users experiencing failed auth from one source IP (Password Spraying)
   */
  private detectPasswordSprayIP(events: NormalizedLogEvent[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const ipGroups = new Map<string, NormalizedLogEvent[]>();

    for (const event of events) {
      if (this.isLoginEvent(event) && event.result === 'FAILURE') {
        const group = ipGroups.get(event.source_ip) || [];
        group.push(event);
        ipGroups.set(event.source_ip, group);
      }
    }

    for (const [ip, group] of ipGroups.entries()) {
      if (ip === '0.0.0.0' || ip === '127.0.0.1') continue;

      for (let i = 0; i < group.length; i++) {
        const windowStart = new Date(group[i].timestamp).getTime();
        const windowEvents = [group[i]];
        const targetedUsers = new Set<string>([group[i].username.toLowerCase()]);

        for (let j = i + 1; j < group.length; j++) {
          const t = new Date(group[j].timestamp).getTime();
          if (t - windowStart <= this.config.failedLoginThresholdWindowMs) {
            windowEvents.push(group[j]);
            targetedUsers.add(group[j].username.toLowerCase());
          } else {
            break;
          }
        }

        if (targetedUsers.size >= this.config.passwordSprayUserThreshold) {
          results.push({
            rule_id: 'RULE_PASSWORD_SPRAY_IP',
            rule_name: 'Distributed Password Spraying Pattern',
            description: `Single source IP '${ip}' attempted failed logins across ${targetedUsers.size} distinct accounts (${Array.from(targetedUsers).slice(0, 5).join(', ')}) within ${Math.round(this.config.failedLoginThresholdWindowMs / 60000)} minutes.`,
            relevant_event_ids: windowEvents.map((e) => e.event_id),
            detection_timestamp: windowEvents[windowEvents.length - 1].timestamp,
            matched_conditions: {
              source_ip: ip,
              distinct_targeted_users: Array.from(targetedUsers),
              total_attempts: windowEvents.length,
              threshold: this.config.passwordSprayUserThreshold,
            },
            suggested_severity: 'HIGH',
            contributing_score: 40,
            mitre_attack_id: 'T1110.003',
            explanation: `A single origin attempting authentication against multiple usernames is characteristic of horizontal password spraying designed to circumvent account lockout policies.`,
            limitations_or_false_positives: 'Can occur if an office proxy or VPN NAT IP hosts multiple employees returning from password rotation.',
          });
          i += windowEvents.length - 1;
        }
      }
    }

    return results;
  }

  /**
   * Rule 3: Successful login following repeated failures (Account Compromise)
   */
  private detectSuccessAfterFailures(events: NormalizedLogEvent[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const userGroups = new Map<string, NormalizedLogEvent[]>();

    for (const event of events) {
      if (this.isLoginEvent(event)) {
        const key = event.username.toLowerCase();
        const group = userGroups.get(key) || [];
        group.push(event);
        userGroups.set(key, group);
      }
    }

    for (const [username, group] of userGroups.entries()) {
      for (let i = 0; i < group.length; i++) {
        if (group[i].result === 'SUCCESS') {
          const successTime = new Date(group[i].timestamp).getTime();
          // Look backwards within window for prior failures
          const priorFailures: NormalizedLogEvent[] = [];
          for (let j = i - 1; j >= 0; j--) {
            const failTime = new Date(group[j].timestamp).getTime();
            if (successTime - failTime <= this.config.successAfterFailureWindowMs) {
              if (group[j].result === 'FAILURE') {
                priorFailures.push(group[j]);
              }
            } else {
              break;
            }
          }

          if (priorFailures.length >= this.config.successAfterFailureThreshold) {
            const allEventIds = [...priorFailures.map((e) => e.event_id).reverse(), group[i].event_id];
            const failureIPs = Array.from(new Set(priorFailures.map((e) => e.source_ip)));

            results.push({
              rule_id: 'RULE_SUCCESS_AFTER_FAILURES',
              rule_name: 'Successful Authentication Following Multiple Failures',
              description: `User '${username}' achieved a successful login at ${group[i].timestamp} immediately following ${priorFailures.length} failed login attempts from IP(s): ${failureIPs.join(', ')}.`,
              relevant_event_ids: allEventIds,
              detection_timestamp: group[i].timestamp,
              matched_conditions: {
                username,
                success_ip: group[i].source_ip,
                failure_ips: failureIPs,
                prior_failure_count: priorFailures.length,
                threshold: this.config.successAfterFailureThreshold,
              },
              suggested_severity: 'CRITICAL',
              contributing_score: 55,
              mitre_attack_id: 'T1078',
              explanation: `A successful login preceded by multiple authentication errors often denotes a successful brute force, credential stuffing, or password guess outcome.`,
              limitations_or_false_positives: 'A legitimate user may have remembered their password on the fourth attempt or unlocked their password vault.',
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Rule 4: Repeated access denied events
   */
  private detectRepeatedAccessDenied(events: NormalizedLogEvent[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const entityGroups = new Map<string, NormalizedLogEvent[]>();

    for (const event of events) {
      if (event.result === 'DENIED') {
        const key = `${event.username.toLowerCase()}::${event.source_ip}`;
        const group = entityGroups.get(key) || [];
        group.push(event);
        entityGroups.set(key, group);
      }
    }

    for (const [key, group] of entityGroups.entries()) {
      const [username, ip] = key.split('::');

      for (let i = 0; i < group.length; i++) {
        const windowStart = new Date(group[i].timestamp).getTime();
        const windowEvents = [group[i]];

        for (let j = i + 1; j < group.length; j++) {
          const t = new Date(group[j].timestamp).getTime();
          if (t - windowStart <= this.config.accessDeniedWindowMs) {
            windowEvents.push(group[j]);
          } else {
            break;
          }
        }

        if (windowEvents.length >= this.config.accessDeniedThreshold) {
          results.push({
            rule_id: 'RULE_REPEATED_ACCESS_DENIED',
            rule_name: 'Repeated Authorization / Access Denied Events',
            description: `User '${username}' received ${windowEvents.length} access-denied or permission-blocked responses from host/IP '${ip}' within ${Math.round(this.config.accessDeniedWindowMs / 60000)} minutes.`,
            relevant_event_ids: windowEvents.map((e) => e.event_id),
            detection_timestamp: windowEvents[windowEvents.length - 1].timestamp,
            matched_conditions: {
              username,
              source_ip: ip,
              denied_count: windowEvents.length,
              threshold: this.config.accessDeniedThreshold,
            },
            suggested_severity: 'MEDIUM',
            contributing_score: 25,
            mitre_attack_id: 'T1068',
            explanation: `Repeated authorization rejections indicate either an active permission probe or an actor attempting to access restricted resources without requisite rights.`,
            limitations_or_false_positives: 'Can be caused by a recent permission downgrade or a misconfigured script trying to query an API.',
          });
          i += windowEvents.length - 1;
        }
      }
    }

    return results;
  }

  /**
   * Rule 5: Suspicious access activity following high-risk authentication sequence
   */
  private detectSuspiciousPostCompromise(events: NormalizedLogEvent[]): DetectionResult[] {
    const results: DetectionResult[] = [];
    const sensitiveActions = [
      'DATA_EXPORT',
      'PRIVILEGE_ELEVATION',
      'ADMIN_ROLE_ADD',
      'CONFIG_MUTATION',
      'BULK_DOWNLOAD',
      'KEY_RETRIEVAL',
      'FIREWALL_RULE_DISABLE',
      'SHELL_EXEC',
      'SENSITIVE_FILE_ACCESS',
    ];

    const sensitiveEvents = events.filter((e) =>
      sensitiveActions.some((act) => e.event_type.toUpperCase().includes(act))
    );

    for (const sens of sensitiveEvents) {
      const sensTime = new Date(sens.timestamp).getTime();
      // Check if there was any prior auth failure or anomaly for this user within postCompromiseWindowMs
      const priorAuthEvents = events.filter((e) => {
        if (e.username.toLowerCase() !== sens.username.toLowerCase()) return false;
        if (!this.isLoginEvent(e)) return false;
        const authTime = new Date(e.timestamp).getTime();
        return sensTime > authTime && sensTime - authTime <= this.config.postCompromiseWindowMs;
      });

      const failedLogins = priorAuthEvents.filter((e) => e.result === 'FAILURE');
      if (failedLogins.length >= 2) {
        results.push({
          rule_id: 'RULE_SUSPICIOUS_POST_COMPROMISE',
          rule_name: 'High-Impact Action After Authentication Anomaly',
          description: `User '${sens.username}' performed critical operation '${sens.event_type}' on '${sens.host}' following ${failedLogins.length} earlier authentication failures within ${Math.round(this.config.postCompromiseWindowMs / 60000)} minutes.`,
          relevant_event_ids: [...failedLogins.map((e) => e.event_id), sens.event_id],
          detection_timestamp: sens.timestamp,
          matched_conditions: {
            username: sens.username,
            action: sens.event_type,
            target_host: sens.host,
            prior_auth_failures: failedLogins.length,
          },
          suggested_severity: 'CRITICAL',
          contributing_score: 50,
          mitre_attack_id: 'T1020',
          explanation: `Execution of high-privilege operations shortly after suspicious authentication sequences is a prominent indicator of active compromise and lateral impact.`,
          limitations_or_false_positives: 'Can occur if an authorized administrator made typos while authenticating to perform scheduled critical maintenance.',
        });
      }
    }

    return results;
  }

  private isLoginEvent(event: NormalizedLogEvent): boolean {
    const t = event.event_type.toUpperCase();
    return t.includes('LOGIN') || t.includes('AUTH') || t.includes('SIGNIN') || t.includes('LOGON');
  }
}
