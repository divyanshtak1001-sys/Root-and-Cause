import { describe, it, expect } from 'vitest';
import { SecurityDetectionEngine } from '@/lib/security/detections/detection-engine';
import { NormalizedLogEvent } from '@/types';

describe('Security Detection Engine', () => {
  const engine = new SecurityDetectionEngine();

  it('produces 0 alerts on normal benign events', () => {
    const cleanEvents: NormalizedLogEvent[] = [
      {
        event_id: 'clean_1',
        timestamp: '2026-10-21T10:00:00Z',
        event_type: 'USER_LOGIN',
        username: 'alice',
        source_ip: '10.0.0.5',
        host: 'web-srv',
        result: 'SUCCESS',
      },
      {
        event_id: 'clean_2',
        timestamp: '2026-10-21T10:05:00Z',
        event_type: 'FILE_READ',
        username: 'alice',
        source_ip: '10.0.0.5',
        host: 'file-srv',
        result: 'SUCCESS',
      },
    ];

    const detections = engine.runDetections(cleanEvents);
    expect(detections.length).toBe(0);
  });

  it('detects repeated failed logins (Brute Force) for same user', () => {
    const base = new Date('2026-10-21T12:00:00Z').getTime();
    const bruteEvents: NormalizedLogEvent[] = [
      {
        event_id: 'bf_1',
        timestamp: new Date(base).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'bob',
        source_ip: '198.51.100.22',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'bf_2',
        timestamp: new Date(base + 60000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'bob',
        source_ip: '198.51.100.22',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'bf_3',
        timestamp: new Date(base + 120000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'bob',
        source_ip: '198.51.100.22',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'bf_4',
        timestamp: new Date(base + 180000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'bob',
        source_ip: '198.51.100.22',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
    ];

    const detections = engine.runDetections(bruteEvents);
    expect(detections.some((d) => d.rule_id === 'RULE_BRUTE_FORCE_USER')).toBe(true);
    const bfAlert = detections.find((d) => d.rule_id === 'RULE_BRUTE_FORCE_USER');
    expect(bfAlert?.relevant_event_ids.length).toBe(4);
    expect(bfAlert?.suggested_severity).toBe('HIGH');
  });

  it('detects password spraying across multiple accounts from single IP', () => {
    const base = new Date('2026-10-21T13:00:00Z').getTime();
    const sprayEvents: NormalizedLogEvent[] = [
      {
        event_id: 'sp_1',
        timestamp: new Date(base).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'user_a',
        source_ip: '203.0.113.99',
        host: 'sso-gw',
        result: 'FAILURE',
      },
      {
        event_id: 'sp_2',
        timestamp: new Date(base + 60000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'user_b',
        source_ip: '203.0.113.99',
        host: 'sso-gw',
        result: 'FAILURE',
      },
      {
        event_id: 'sp_3',
        timestamp: new Date(base + 120000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'user_c',
        source_ip: '203.0.113.99',
        host: 'sso-gw',
        result: 'FAILURE',
      },
    ];

    const detections = engine.runDetections(sprayEvents);
    expect(detections.some((d) => d.rule_id === 'RULE_PASSWORD_SPRAY_IP')).toBe(true);
  });

  it('detects successful login following failures (Potential Compromise)', () => {
    const base = new Date('2026-10-21T14:00:00Z').getTime();
    const compromiseEvents: NormalizedLogEvent[] = [
      {
        event_id: 'comp_1',
        timestamp: new Date(base).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'charlie',
        source_ip: '198.51.100.50',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'comp_2',
        timestamp: new Date(base + 60000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'charlie',
        source_ip: '198.51.100.50',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'comp_3',
        timestamp: new Date(base + 120000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'charlie',
        source_ip: '198.51.100.50',
        host: 'vpn-srv',
        result: 'FAILURE',
      },
      {
        event_id: 'comp_4',
        timestamp: new Date(base + 180000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'charlie',
        source_ip: '198.51.100.50',
        host: 'vpn-srv',
        result: 'SUCCESS',
      },
    ];

    const detections = engine.runDetections(compromiseEvents);
    expect(detections.some((d) => d.rule_id === 'RULE_SUCCESS_AFTER_FAILURES')).toBe(true);
    const alert = detections.find((d) => d.rule_id === 'RULE_SUCCESS_AFTER_FAILURES');
    expect(alert?.suggested_severity).toBe('CRITICAL');
  });

  it('detects repeated access denied violations', () => {
    const base = new Date('2026-10-21T15:00:00Z').getTime();
    const deniedEvents: NormalizedLogEvent[] = [
      {
        event_id: 'den_1',
        timestamp: new Date(base).toISOString(),
        event_type: 'RESOURCE_ACCESS',
        username: 'contractor',
        source_ip: '10.0.1.20',
        host: 'prod-db',
        result: 'DENIED',
      },
      {
        event_id: 'den_2',
        timestamp: new Date(base + 60000).toISOString(),
        event_type: 'RESOURCE_ACCESS',
        username: 'contractor',
        source_ip: '10.0.1.20',
        host: 'prod-db',
        result: 'DENIED',
      },
      {
        event_id: 'den_3',
        timestamp: new Date(base + 120000).toISOString(),
        event_type: 'RESOURCE_ACCESS',
        username: 'contractor',
        source_ip: '10.0.1.20',
        host: 'prod-db',
        result: 'DENIED',
      },
    ];

    const detections = engine.runDetections(deniedEvents);
    expect(detections.some((d) => d.rule_id === 'RULE_REPEATED_ACCESS_DENIED')).toBe(true);
  });
});
