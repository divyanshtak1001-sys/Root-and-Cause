import { describe, it, expect } from 'vitest';
import { EventCorrelationEngine } from '@/lib/security/correlation/correlation-engine';
import { RiskScorer } from '@/lib/security/scoring/risk-scorer';
import { EvidenceManager } from '@/lib/security/evidence/evidence-manager';
import { DetectionResult, NormalizedLogEvent, Incident } from '@/types';

describe('Correlation, Scoring, and Evidence Validation', () => {
  it('correlates detections and surrounding events into an incident', () => {
    const events: NormalizedLogEvent[] = [
      {
        event_id: 'e1',
        timestamp: '2026-10-21T12:00:00Z',
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gw',
        result: 'FAILURE',
      },
      {
        event_id: 'e2',
        timestamp: '2026-10-21T12:05:00Z',
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gw',
        result: 'SUCCESS',
      },
    ];

    const detections: DetectionResult[] = [
      {
        rule_id: 'RULE_BRUTE_FORCE_USER',
        rule_name: 'Brute Force Alert',
        description: 'Failed login attempts',
        relevant_event_ids: ['e1'],
        detection_timestamp: '2026-10-21T12:00:00Z',
        matched_conditions: { user: 'analyst01' },
        suggested_severity: 'HIGH',
        contributing_score: 35,
        explanation: 'Repeated failures',
        limitations_or_false_positives: 'Typos',
      },
    ];

    const correlator = new EventCorrelationEngine();
    const incidents = correlator.correlate(events, detections);

    expect(incidents.length).toBe(1);
    expect(incidents[0].primary_user).toBe('analyst01');
    expect(incidents[0].primary_ip).toBe('198.51.100.42');
    expect(incidents[0].event_ids).toContain('e1');
    expect(incidents[0].event_ids).toContain('e2'); // included as contextual event
  });

  it('calculates deterministic risk score and dampens overlapping evidence', () => {
    const detections: DetectionResult[] = [
      {
        rule_id: 'R1',
        rule_name: 'Alert 1',
        description: '',
        relevant_event_ids: ['e1', 'e2', 'e3'],
        detection_timestamp: '2026-10-21T12:00:00Z',
        matched_conditions: {},
        suggested_severity: 'HIGH',
        contributing_score: 50,
        explanation: '',
        limitations_or_false_positives: '',
      },
      {
        rule_id: 'R2',
        rule_name: 'Alert 2 (Overlapping)',
        description: '',
        relevant_event_ids: ['e1', 'e2', 'e3'], // 100% overlap
        detection_timestamp: '2026-10-21T12:05:00Z',
        matched_conditions: {},
        suggested_severity: 'HIGH',
        contributing_score: 50,
        explanation: '',
        limitations_or_false_positives: '',
      },
    ];

    const result = RiskScorer.calculate(detections, 3);
    // Because R2 has 100% overlap with R1, its score contribution is attenuated, preventing double counting
    expect(result.score).toBeLessThan(100);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it('validates evidence references and detects hallucinated IDs', () => {
    const mockIncident: Incident = {
      id: 'inc_test',
      workspace_id: 'ws_test',
      title: 'Test Incident',
      severity: 'HIGH',
      risk_score: 65,
      confidence: 80,
      status: 'NEW',
      summary: 'Test summary',
      first_seen: '2026-10-21T12:00:00Z',
      last_seen: '2026-10-21T12:10:00Z',
      event_count: 2,
      event_ids: ['evt_real_1', 'evt_real_2'],
      detections: [],
      created_at: '2026-10-21T12:00:00Z',
      updated_at: '2026-10-21T12:00:00Z',
    };

    // Valid check
    const validCheck = EvidenceManager.verifyEvidenceReferences(mockIncident, ['evt_real_1']);
    expect(validCheck.isValid).toBe(true);
    expect(validCheck.validIds).toEqual(['evt_real_1']);

    // Hallucination check
    const invalidCheck = EvidenceManager.verifyEvidenceReferences(mockIncident, [
      'evt_real_1',
      'evt_fake_hallucinated',
    ]);
    expect(invalidCheck.isValid).toBe(false);
    expect(invalidCheck.invalidIds).toContain('evt_fake_hallucinated');
  });

  it('generates a complete deterministic fallback report with real timeline', () => {
    const mockIncident: Incident = {
      id: 'inc_fallback_test',
      workspace_id: 'ws_test',
      title: 'Compromise Test',
      severity: 'CRITICAL',
      risk_score: 90,
      confidence: 85,
      status: 'INVESTIGATING',
      summary: 'Severe compromise',
      first_seen: '2026-10-21T12:00:00Z',
      last_seen: '2026-10-21T12:15:00Z',
      primary_user: 'analyst01',
      primary_ip: '198.51.100.42',
      primary_host: 'vpn-gw',
      event_count: 2,
      event_ids: ['e1', 'e2'],
      detections: [
        {
          rule_id: 'RULE_SUCCESS_AFTER_FAILURES',
          rule_name: 'Compromise Detected',
          description: 'Login after failures',
          relevant_event_ids: ['e1', 'e2'],
          detection_timestamp: '2026-10-21T12:15:00Z',
          matched_conditions: {},
          suggested_severity: 'CRITICAL',
          contributing_score: 55,
          explanation: 'Account compromise',
          limitations_or_false_positives: '',
          mitre_attack_id: 'T1078',
        },
      ],
      created_at: '2026-10-21T12:00:00Z',
      updated_at: '2026-10-21T12:00:00Z',
    };

    const events: NormalizedLogEvent[] = [
      {
        event_id: 'e1',
        timestamp: '2026-10-21T12:00:00Z',
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gw',
        result: 'FAILURE',
      },
      {
        event_id: 'e2',
        timestamp: '2026-10-21T12:15:00Z',
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gw',
        result: 'SUCCESS',
      },
    ];

    const report = EvidenceManager.generateFallbackReport(mockIncident, events);
    expect(report.generation_method).toBe('deterministic_fallback');
    expect(report.event_timeline.length).toBe(2);
    expect(report.evidence_references).toEqual(['e1', 'e2']);
    expect(report.relevant_attack_techniques).toContain('T1078');
    expect(report.observations.length).toBeGreaterThan(0);
  });
});
