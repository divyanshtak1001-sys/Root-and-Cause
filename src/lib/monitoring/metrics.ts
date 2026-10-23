// Runtime metrics are server-side state. This module is imported only by route handlers
// and server code; it must not be imported from a Client Component.

/**
 * In-process runtime metrics.
 *
 * Every value here is incremented by a real code path as it executes (an upload that was
 * actually parsed, a Gemini call that actually ran or actually failed). Nothing is
 * derived from configuration or invented.
 *
 * Limitations, stated plainly:
 *  - These counters live in the Node process and reset on restart / redeploy.
 *  - They are NOT aggregated across instances (serverless or multi-replica deployments
 *    would each report only their own slice).
 *  - They describe this application's own requests. They say nothing about any external
 *    machine, network, endpoint or cloud account.
 */

export interface MetricsSnapshot {
  startedAt: string;
  uptimeSeconds: number;
  ingestion: {
    uploadsTotal: number;
    uploadsFailed: number;
    rowsAccepted: number;
    rowsRejected: number;
    lastUploadAt: string | null;
    lastError: string | null;
  };
  detection: {
    runsTotal: number;
    detectionsTotal: number;
    incidentsCreated: number;
    lastRunAt: string | null;
    lastError: string | null;
  };
  ai: {
    requestsTotal: number;
    geminiSuccess: number;
    geminiFailures: number;
    fallbackResponses: number;
    lastRequestAt: string | null;
    lastLatencyMs: number | null;
    lastError: string | null;
  };
  reports: {
    generatedTotal: number;
    failures: number;
    lastError: string | null;
  };
}

interface MutableMetrics extends Omit<MetricsSnapshot, 'startedAt' | 'uptimeSeconds'> {
  startedAtMs: number;
}

const initial = (): MutableMetrics => ({
  startedAtMs: Date.now(),
  ingestion: {
    uploadsTotal: 0,
    uploadsFailed: 0,
    rowsAccepted: 0,
    rowsRejected: 0,
    lastUploadAt: null,
    lastError: null,
  },
  detection: {
    runsTotal: 0,
    detectionsTotal: 0,
    incidentsCreated: 0,
    lastRunAt: null,
    lastError: null,
  },
  ai: {
    requestsTotal: 0,
    geminiSuccess: 0,
    geminiFailures: 0,
    fallbackResponses: 0,
    lastRequestAt: null,
    lastLatencyMs: null,
    lastError: null,
  },
  reports: { generatedTotal: 0, failures: 0, lastError: null },
});

// Survive hot reloads in development and module re-evaluation across route bundles.
const globalForMetrics = globalThis as unknown as { __rrMetrics?: MutableMetrics };
const metrics: MutableMetrics = globalForMetrics.__rrMetrics ?? initial();
globalForMetrics.__rrMetrics = metrics;

function now(): string {
  return new Date().toISOString();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const metricsStore = {
  recordUpload(accepted: number, rejected: number): void {
    metrics.ingestion.uploadsTotal += 1;
    metrics.ingestion.rowsAccepted += accepted;
    metrics.ingestion.rowsRejected += rejected;
    metrics.ingestion.lastUploadAt = now();
  },

  recordUploadFailure(error: unknown): void {
    metrics.ingestion.uploadsFailed += 1;
    metrics.ingestion.lastError = message(error).slice(0, 300);
  },

  recordDetectionRun(detections: number, incidents: number): void {
    metrics.detection.runsTotal += 1;
    metrics.detection.detectionsTotal += detections;
    metrics.detection.incidentsCreated += incidents;
    metrics.detection.lastRunAt = now();
  },

  recordDetectionFailure(error: unknown): void {
    metrics.detection.lastError = message(error).slice(0, 300);
  },

  recordAiSuccess(latencyMs: number, provider: 'gemini'): void {
    metrics.ai.requestsTotal += 1;
    if (provider === 'gemini') metrics.ai.geminiSuccess += 1;
    metrics.ai.lastRequestAt = now();
    metrics.ai.lastLatencyMs = Math.round(latencyMs);
    metrics.ai.lastError = null;
  },

  recordAiFallback(latencyMs: number, reason: string): void {
    metrics.ai.requestsTotal += 1;
    metrics.ai.fallbackResponses += 1;
    metrics.ai.lastRequestAt = now();
    metrics.ai.lastLatencyMs = Math.round(latencyMs);
    metrics.ai.lastError = reason.slice(0, 300);
  },

  recordAiFailure(error: unknown): void {
    metrics.ai.geminiFailures += 1;
    metrics.ai.lastError = message(error).slice(0, 300);
  },

  recordReport(failed: boolean, error?: unknown): void {
    if (failed) {
      metrics.reports.failures += 1;
      if (error) metrics.reports.lastError = message(error).slice(0, 300);
    } else {
      metrics.reports.generatedTotal += 1;
    }
  },

  snapshot(): MetricsSnapshot {
    return {
      startedAt: new Date(metrics.startedAtMs).toISOString(),
      uptimeSeconds: Math.round((Date.now() - metrics.startedAtMs) / 1000),
      ingestion: { ...metrics.ingestion },
      detection: { ...metrics.detection },
      ai: { ...metrics.ai },
      reports: { ...metrics.reports },
    };
  },

  /** Test-only reset so counters do not leak between cases. */
  reset(): void {
    Object.assign(metrics, initial());
  },
};
