import { describe, it, expect, beforeEach } from 'vitest';
import { dataStore } from '@/lib/storage/data-store';
import { parseLogContent } from '@/lib/security/parsers/log-parser';
import { SecurityDetectionEngine } from '@/lib/security/detections/detection-engine';
import { EventCorrelationEngine } from '@/lib/security/correlation/correlation-engine';
import { IngestSummary } from '@/types';

const BRUTE_FORCE_CSV = [
  'timestamp,event_type,username,source_ip,host,result',
  '2026-10-21T09:00:00Z,USER_LOGIN,mallory,192.0.2.9,sso,FAILURE',
  '2026-10-21T09:00:10Z,USER_LOGIN,mallory,192.0.2.9,sso,FAILURE',
  '2026-10-21T09:00:20Z,USER_LOGIN,mallory,192.0.2.9,sso,FAILURE',
  '2026-10-21T09:00:30Z,USER_LOGIN,mallory,192.0.2.9,sso,FAILURE',
  '2026-10-21T09:00:40Z,USER_LOGIN,mallory,192.0.2.9,sso,SUCCESS',
].join('\n');

function ingest(uploadId: string) {
  const { events } = parseLogContent(BRUTE_FORCE_CSV, `${uploadId}.csv`, uploadId);
  const summary: IngestSummary = {
    upload_id: uploadId,
    filename: `${uploadId}.csv`,
    total_rows: events.length,
    accepted_rows: events.length,
    rejected_rows: 0,
    errors: [],
    created_at: new Date().toISOString(),
  };
  dataStore.saveUpload(summary, events);

  const detections = new SecurityDetectionEngine().runDetections(events);
  const incidents = new EventCorrelationEngine().correlate(events, detections);
  dataStore.saveIncidents(incidents);
  return { events, incidents };
}

describe('InMemoryDataStore shared state', () => {
  beforeEach(() => {
    dataStore.seedDemoData();
  });

  it('is registered on globalThis so every route bundle resolves one instance', () => {
    // Regression guard: production used to skip this registration, so separate
    // route bundles each built their own store and /api/v1/stats reported stale
    // counters while /api/v1/uploads saw the new data.
    const registered = (globalThis as Record<string, unknown>).__dataStore;
    expect(registered).toBeDefined();
    expect(registered).toBe(dataStore);
  });

  it('keeps getStats consistent with getUploads and getIncidents after ingest', () => {
    const before = dataStore.getStats();
    const { events } = ingest('upl_regression_1');

    const after = dataStore.getStats();
    expect(after.totalUploads).toBe(before.totalUploads + 1);
    expect(after.totalUploads).toBe(dataStore.getUploads().length);
    expect(after.totalEvents).toBe(before.totalEvents + events.length);
    expect(after.totalEvents).toBe(dataStore.getEvents().length);
    expect(after.totalIncidents).toBe(dataStore.getIncidents().length);
  });

  it('resets back to the deterministic demo fixtures on seedDemoData', () => {
    ingest('upl_regression_2');
    dataStore.seedDemoData();

    const stats = dataStore.getStats();
    expect(stats.totalUploads).toBe(1);
    expect(stats.totalEvents).toBe(15);
    expect(stats.totalIncidents).toBe(3);
    expect(dataStore.getUploads()[0].upload_id).toBe('upl_demo_master');
  });
});
