import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseLogContent } from '@/lib/security/parsers/log-parser';

/**
 * Regression coverage for "CSV Parse error: Too many fields: expected 5 fields but
 * parsed 6". That message appears when the header declares fewer columns than the
 * records contain — typically because `host` is missing from the header while the
 * rows still carry it. PapaParse exposes the surplus in `__parsed_extra` and emits a
 * FieldMismatch error, so without repair the row is reported as broken AND the
 * `result` column shifts into `host`, silently turning SUCCESS into UNKNOWN.
 */

const HEADER_FIVE_EXPLICIT_RESULT = 'timestamp,event_type,username,source_ip,result';
const HEADER_FIVE_EXPLICIT_HOST = 'timestamp,event_type,username,source_ip,host';

function toCsv(header: string, rows: string[]): string {
  return [header, ...rows].join('\n');
}

describe('CSV field-count handling', () => {
  it('parses a canonical 5-column CSV with no errors', () => {
    const csv = toCsv(HEADER_FIVE_EXPLICIT_RESULT, [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,SUCCESS',
      '2026-10-21T09:01:00Z,USER_LOGIN,alice,1.2.3.4,FAILURE',
    ]);
    const result = parseLogContent(csv, 'five.csv', 'upl_1');
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].result).toBe('SUCCESS');
    expect(result.events[1].result).toBe('FAILURE');
  });

  it('parses a valid 6-column CSV (full canonical schema)', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result', [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso-gateway,SUCCESS',
    ]);
    const result = parseLogContent(csv, 'six.csv', 'upl_2');
    expect(result.errors).toEqual([]);
    expect(result.events[0]).toMatchObject({
      host: 'sso-gateway',
      result: 'SUCCESS',
      username: 'alice',
    });
  });

  // The exact reported failure.
  it('repairs rows with an extra field when the header omits "host"', () => {
    const csv = toCsv(HEADER_FIVE_EXPLICIT_RESULT, [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,SUCCESS,sso-gateway',
      '2026-10-21T09:01:00Z,USER_LOGIN,bob,1.2.3.4,FAILURE,sso-gateway',
    ]);
    const result = parseLogContent(csv, 'missing-host.csv', 'upl_3');

    // No "Too many fields" errors survive, and no rows are lost.
    expect(result.errors.filter((e) => /too many fields/i.test(e.reason))).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    // The surplus value fills `host`; `result` stays correct instead of shifting.
    expect(result.events[0]).toMatchObject({ host: 'sso-gateway', result: 'SUCCESS' });
    expect(result.events[1]).toMatchObject({ host: 'sso-gateway', result: 'FAILURE' });
  });

  it('repairs rows when the header omits "result" (surplus is the result)', () => {
    const csv = toCsv(HEADER_FIVE_EXPLICIT_HOST, [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso-gateway,SUCCESS',
    ]);
    const result = parseLogContent(csv, 'missing-result.csv', 'upl_4');
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ result: 'SUCCESS', host: 'sso-gateway' });
  });

  it('handles quoted values containing commas', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result,notes', [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso,FAILURE,"blocked, retried, failed"',
    ]);
    const result = parseLogContent(csv, 'quoted.csv', 'upl_5');
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].result).toBe('FAILURE');
    expect((result.events[0].raw_payload as Record<string, unknown>).notes).toBe('blocked, retried, failed');
  });

  it('handles escaped double quotes inside a quoted field', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result,notes', [
      '2026-10-21T09:00:00Z,USER_LOGIN,"say ""hi""",1.2.3.4,sso,FAILURE,"he said ""denied"""',
    ]);
    const result = parseLogContent(csv, 'escaped.csv', 'upl_6');
    expect(result.errors).toEqual([]);
    expect(result.events[0].username).toBe('say "hi"');
  });

  it('reports rows missing fields without fabricating data', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result', [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice',
    ]);
    const result = parseLogContent(csv, 'short.csv', 'upl_7');
    expect(result.events).toHaveLength(1); // normalizer still accepts it...
    expect(result.errors.some((e) => /too few fields/i.test(e.reason))).toBe(true); // ...and it is flagged
  });

  it('reports rows whose extra values cannot be mapped confidently', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result', [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso,FAILURE,surplus1,surplus2',
    ]);
    const result = parseLogContent(csv, 'overflow.csv', 'upl_8');
    // The header is complete, so there is no gap to fill: surface the mismatch instead
    // of guessing, and keep the row (its canonical fields are all valid).
    expect(result.events).toHaveLength(1);
    expect(result.errors.some((e) => /too many fields/i.test(e.reason))).toBe(true);
  });

  it('rejects rows with an empty timestamp and records the reason', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result', [
      ',USER_LOGIN,alice,1.2.3.4,sso,FAILURE',
      '2026-10-21T09:00:00Z,,alice,1.2.3.4,sso,FAILURE',
    ]);
    const result = parseLogContent(csv, 'bad-rows.csv', 'upl_9');
    expect(result.events).toHaveLength(0);
    expect(result.errors[0].reason).toContain('timestamp');
    expect(result.errors[1].reason).toContain('event_type');
  });

  it('normalizes timestamps to UTC ISO-8601 for accepted rows', () => {
    const csv = toCsv('timestamp,event_type,username,source_ip,host,result', [
      '2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso,SUCCESS',
    ]);
    const event = parseLogContent(csv, 'tz.csv', 'upl_10').events[0];
    expect(event.timestamp).toBe('2026-10-21T09:00:00.000Z');
  });

  it('deduplicates repeated event ids within a batch', () => {
    const csv = toCsv('event_id,timestamp,event_type,username,source_ip,host,result', [
      'evt_same,2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso,FAILURE',
      'evt_same,2026-10-21T09:00:00Z,USER_LOGIN,alice,1.2.3.4,sso,FAILURE',
    ]);
    expect(parseLogContent(csv, 'dupe.csv', 'upl_11').events).toHaveLength(1);
  });

  it('parses Windows Event Viewer CSV exports with 5 headers and trailing message field', () => {
    const csv = toCsv('Level,Date and Time,Source,Event ID,Task Category', [
      'Information,21-10-2026 22:11:29,Microsoft-Windows-Security-SPP,16384,None,Successfully scheduled Software Protection service for re-start at 2126-09-27T16:40:29Z. Reason: RulesEngine.',
      'Information,21-10-2026 22:10:31,Microsoft-Windows-Security-SPP,16394,None,Offline downlevel migration succeeded.',
      'Information,21-10-2026 22:05:00,Microsoft-Windows-Security-Auditing,4624,Logon,An account was successfully logged on. Account Name: testuser',
    ]);
    const result = parseLogContent(csv, 'event log.csv', 'upl_win');

    // Must not emit any "Too many fields" errors
    expect(result.errors.filter((e) => /too many fields/i.test(e.reason))).toHaveLength(0);
    expect(result.events).toHaveLength(3);

    // Events are sorted chronologically ascending:
    // 22:05:00 is index 0, 22:10:31 is index 1, 22:11:29 is index 2
    expect(result.events[2].timestamp).toBe('2026-10-21T22:11:29.000Z');
    expect(result.events[2].result).toBe('SUCCESS');
    expect(result.events[2].host).toBe('Microsoft-Windows-Security-SPP');
    expect(result.events[2].event_type).toBe('Microsoft-Windows-Security-SPP (16384)');

    // Verifies Windows security logon mapping and username extraction (22:05:00)
    expect(result.events[0].event_type).toBe('WINDOWS_LOGON_SUCCESS (4624)');
    expect(result.events[0].username).toBe('testuser');
  });
});

describe('Bundled synthetic demo datasets', () => {
  const dir = path.resolve(__dirname, '../../public/samples');

  it('parses synthetic_password_spray.csv with zero errors', () => {
    const result = parseLogContent(
      fs.readFileSync(path.join(dir, 'synthetic_password_spray.csv'), 'utf8'),
      'synthetic_password_spray.csv',
      'upl_spray'
    );
    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(5);
    expect(result.events.every((e) => e.source_ip === '203.0.113.88')).toBe(true);
    expect(result.events.every((e) => e.result === 'FAILURE')).toBe(true);
  });

  it('parses synthetic_malformed_and_injection.csv and reports only genuinely bad rows', () => {
    const result = parseLogContent(
      fs.readFileSync(path.join(dir, 'synthetic_malformed_and_injection.csv'), 'utf8'),
      'synthetic_malformed_and_injection.csv',
      'upl_mal'
    );
    // Rows 1 (no timestamp) and 2 (no event_type) are invalid; the other four parse.
    expect(result.events).toHaveLength(4);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.some((e) => /timestamp/i.test(e.reason))).toBe(true);
    expect(result.errors.some((e) => /event_type/i.test(e.reason))).toBe(true);
    expect(result.errors.some((e) => /too many fields/i.test(e.reason))).toBe(false);
  });

  it('parses synthetic_auth_brute_force.json with zero errors', () => {
    const result = parseLogContent(
      fs.readFileSync(path.join(dir, 'synthetic_auth_brute_force.json'), 'utf8'),
      'synthetic_auth_brute_force.json',
      'upl_bf'
    );
    expect(result.errors).toEqual([]);
    expect(result.events.length).toBeGreaterThan(0);
  });
});
