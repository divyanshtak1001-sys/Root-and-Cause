import { describe, it, expect, beforeEach } from 'vitest';
import { metricsStore } from '@/lib/monitoring/metrics';

describe('Runtime metrics registry', () => {
  beforeEach(() => {
    metricsStore.reset();
  });

  it('starts empty and reports uptime', () => {
    const snap = metricsStore.snapshot();
    expect(snap.ingestion.uploadsTotal).toBe(0);
    expect(snap.ai.requestsTotal).toBe(0);
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('accumulates real ingestion outcomes', () => {
    metricsStore.recordUpload(10, 2);
    metricsStore.recordUpload(5, 0);
    metricsStore.recordUploadFailure(new Error('boom'));

    const snap = metricsStore.snapshot();
    expect(snap.ingestion.uploadsTotal).toBe(2);
    expect(snap.ingestion.uploadsFailed).toBe(1);
    expect(snap.ingestion.rowsAccepted).toBe(15);
    expect(snap.ingestion.rowsRejected).toBe(2);
    expect(snap.ingestion.lastError).toContain('boom');
    expect(snap.ingestion.lastUploadAt).not.toBeNull();
  });

  it('accumulates detection runs', () => {
    metricsStore.recordDetectionRun(4, 2);
    metricsStore.recordDetectionRun(1, 1);

    const snap = metricsStore.snapshot();
    expect(snap.detection.runsTotal).toBe(2);
    expect(snap.detection.detectionsTotal).toBe(5);
    expect(snap.detection.incidentsCreated).toBe(3);
  });

  it('records live AI success separately from fallback', () => {
    metricsStore.recordAiSuccess(1200, 'gemini');
    metricsStore.recordAiFallback(30, 'GEMINI_API_KEY is not configured');

    const snap = metricsStore.snapshot();
    expect(snap.ai.requestsTotal).toBe(2);
    expect(snap.ai.geminiSuccess).toBe(1);
    expect(snap.ai.fallbackResponses).toBe(1);
    expect(snap.ai.lastLatencyMs).toBe(30);
  });

  it('records AI failures without counting them as success', () => {
    metricsStore.recordAiFailure(new Error('503 UNAVAILABLE'));
    const snap = metricsStore.snapshot();
    expect(snap.ai.geminiSuccess).toBe(0);
    expect(snap.ai.geminiFailures).toBe(1);
    expect(snap.ai.lastError).toContain('503');
  });

  it('tracks report generation outcomes', () => {
    metricsStore.recordReport(false);
    metricsStore.recordReport(true, new Error('zod failed'));
    const snap = metricsStore.snapshot();
    expect(snap.reports.generatedTotal).toBe(1);
    expect(snap.reports.failures).toBe(1);
    expect(snap.reports.lastError).toContain('zod');
  });

  it('returns a defensive copy so callers cannot mutate the store', () => {
    const snap = metricsStore.snapshot();
    snap.ingestion.uploadsTotal = 999;
    expect(metricsStore.snapshot().ingestion.uploadsTotal).toBe(0);
  });
});
