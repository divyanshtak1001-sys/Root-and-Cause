'use client';

import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Database, Cpu, Sparkles } from 'lucide-react';

interface HealthPayload {
  status: string;
  persistence: { mode: string; cloudConfigured: boolean; cloudConnected: boolean };
  ai: { provider: string; configured: boolean; model: string; mode: string };
  adbt: { installed: boolean; connected: boolean; error: string | null };
  analysisMode: string;
  analysisModeNote: string;
  metrics: {
    uptimeSeconds: number;
    ingestion: { uploadsTotal: number; uploadsFailed: number; rowsAccepted: number; rowsRejected: number; lastError: string | null };
    detection: { runsTotal: number; detectionsTotal: number; incidentsCreated: number; lastError: string | null };
    ai: { requestsTotal: number; geminiSuccess: number; geminiFailures: number; fallbackResponses: number; lastLatencyMs: number | null; lastError: string | null };
    reports: { generatedTotal: number; failures: number };
  };
}

function Row({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-1.5 text-slate-300">
        {ok ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        )}
        {label}
      </span>
      <span className={`font-mono text-[11px] ${ok ? 'text-emerald-300' : 'text-amber-300'}`}>{detail}</span>
    </div>
  );
}

/**
 * Operational status panel.
 *
 * Every value is fetched from `/api/v1/health`, which measures real dependencies at
 * request time. Nothing here is hardcoded or estimated.
 */
export function OperationalStatusPanel() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/v1/health', { cache: 'no-store' });
        const json = await res.json();
        if (!cancelled) {
          if (json?.data) setHealth(json.data);
          else setError(json?.error ?? 'Health check returned no data');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span>Checking operational status…</span>
        </div>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="p-5 rounded-xl bg-[#0d1527] border border-red-900/60 space-y-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <span>Operational Status</span>
        </h3>
        <p className="text-xs text-red-300 font-mono break-words">
          Health check failed: {error ?? 'unknown error'}
        </p>
      </div>
    );
  }

  const { persistence, ai, adbt, metrics } = health;

  return (
    <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>Operational Status</span>
        </h3>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${health.status === 'ready'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-amber-950/60 border-amber-800 text-amber-300'
            }`}
        >
          {health.status.toUpperCase()}
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 pt-1">
          <Database className="w-3 h-3" /> <span>Persistence</span>
        </div>
        <Row
          label="Supabase"
          ok={persistence.cloudConfigured ? persistence.cloudConnected : false}
          detail={
            persistence.cloudConfigured
              ? persistence.cloudConnected
                ? 'connected'
                : 'unreachable'
              : 'not configured'
          }
        />
        <Row label="Mode" ok detail={persistence.mode} />

        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 pt-2">
          <Sparkles className="w-3 h-3" /> <span>AI provider</span>
        </div>
        <Row
          label="Gemini"
          ok={ai.configured}
          detail={ai.configured ? `${ai.model} (live)` : 'deterministic fallback'}
        />
        <Row
          label="Requests"
          ok={metrics.ai.geminiFailures === 0}
          detail={`${metrics.ai.requestsTotal} total · ${metrics.ai.geminiSuccess} live · ${metrics.ai.fallbackResponses} fallback`}
        />
        {metrics.ai.lastError && (
          <p className="text-[10px] font-mono text-amber-400/90 break-words">last error: {metrics.ai.lastError}</p>
        )}

        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 pt-2">
          <Cpu className="w-3 h-3" /> <span>Tooling</span>
        </div>
        <Row label="Amazon ADBT" ok={adbt.installed} detail={adbt.installed ? 'installed' : 'missing'} />

        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 pt-2">
          <Clock className="w-3 h-3" /> <span>Since start ({metrics.uptimeSeconds}s)</span>
        </div>
        <Row
          label="Ingestion"
          ok={metrics.ingestion.uploadsFailed === 0}
          detail={`${metrics.ingestion.uploadsTotal} uploads · ${metrics.ingestion.rowsAccepted} accepted · ${metrics.ingestion.rowsRejected} rejected`}
        />
        <Row
          label="Detection"
          ok={metrics.detection.runsTotal > 0}
          detail={`${metrics.detection.runsTotal} runs · ${metrics.detection.detectionsTotal} detections · ${metrics.detection.incidentsCreated} incidents`}
        />
        <Row label="Reports" ok={metrics.reports.failures === 0} detail={`${metrics.reports.generatedTotal} generated`} />
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed border-t border-[#1a2a47] pt-2">
        {health.analysisModeNote}
      </p>
    </div>
  );
}
