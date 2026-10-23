'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Activity,
  UploadCloud,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  Database,
  RefreshCw,
} from 'lucide-react';
import { Incident, IngestSummary } from '@/types';
import { getSeverityBadgeClass, getRiskScoreColor, formatDateTime } from '@/lib/utils';
import { OperationalStatusPanel } from '@/components/dashboard/OperationalStatusPanel';

export default function DashboardPage() {
  const [stats, setStats] = useState<{
    totalEvents: number;
    totalIncidents: number;
    severityCounts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
    averageRiskScore: number;
    totalUploads: number;
  } | null>(null);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [uploads, setUploads] = useState<IngestSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [statsRes, incRes, uplRes] = await Promise.all([
        fetch('/api/v1/stats'),
        fetch('/api/v1/incidents'),
        fetch('/api/v1/uploads'),
      ]);

      const statsJson = await statsRes.json();
      const incJson = await incRes.json();
      const uplJson = await uplRes.json();

      if (statsJson.success) setStats(statsJson.data);
      if (incJson.success) setIncidents(incJson.data);
      if (uplJson.success) setUploads(uplJson.data);
    } catch (e) {
      console.error('Failed to load dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadDashboardData();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a47] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Activity className="w-6 h-6 text-cyan-400" />
            <span>SOC Investigation Dashboard</span>
          </h1>
          <p className="text-sm text-slate-400">
            Incident queue, detection metrics, and correlated event timelines from ingested logs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/logs"
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition-colors shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Ingest New Logs</span>
          </Link>
          <button
            onClick={loadDashboardData}
            title="Refresh dashboard"
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Events Ingested */}
        <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Events Processed</span>
            <Database className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {stats ? stats.totalEvents.toLocaleString() : '—'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Across {stats?.totalUploads || 0} log batch uploads</p>
        </div>

        {/* Total Incidents */}
        <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Correlated Incidents</span>
            <ShieldAlert className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">
            {stats ? stats.totalIncidents : '—'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Deduplicated entity clusters</p>
        </div>

        {/* Average Risk Score */}
        <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Average Risk Score</span>
            <TrendingUp className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono flex items-baseline gap-2">
            <span className={stats ? getRiskScoreColor(stats.averageRiskScore) : ''}>
              {stats ? stats.averageRiskScore : '—'}
            </span>
            <span className="text-xs text-slate-500 font-normal">/ 100</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">Deterministic risk model</p>
        </div>

        {/* Critical & High Count */}
        <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">High & Critical</span>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400 font-mono">
            {stats ? (stats.severityCounts.CRITICAL + stats.severityCounts.HIGH) : '—'}
          </div>
          <p className="text-xs text-slate-400 mt-1">Requires active analyst review</p>
        </div>
      </div>

      {/* Incidents Queue & Recent Uploads Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Prioritized Incidents (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-cyan-400" />
              <span>Prioritized Security Incidents</span>
            </h2>
            <Link
              href="/incidents"
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>View full queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-3">
            {incidents.length === 0 ? (
              <div className="p-8 text-center bg-[#0d1527] rounded-xl border border-[#1a2a47] text-slate-400">
                No incidents detected yet. Upload logs to trigger correlation.
              </div>
            ) : (
              incidents.slice(0, 5).map((inc) => (
                <Link
                  key={inc.id}
                  href={`/incidents/${inc.id}`}
                  className="block p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47] hover:border-cyan-700/60 transition-all hover:bg-[#111c35] group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getSeverityBadgeClass(inc.severity)}`}>
                        {inc.severity}
                      </span>
                      {'data_source' in inc && inc.data_source === 'SYNTHETIC_DEMO' && (
                        <span
                          title="Generated demonstration data — not a real security event"
                          className="px-2 py-0.5 rounded text-[10px] font-semibold border bg-amber-950/60 border-amber-800 text-amber-300 uppercase"
                        >
                          Synthetic
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-400">
                        {inc.id}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {inc.event_count} events
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Risk Score</div>
                        <div className={`text-base font-bold font-mono ${getRiskScoreColor(inc.risk_score)}`}>
                          {inc.risk_score}
                          <span className="text-[10px] text-slate-500 font-normal">/100</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors mb-1">
                    {inc.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-1 mb-3">
                    {inc.summary}
                  </p>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-2 border-t border-[#1a2a47]/60">
                    <div>User: <span className="text-slate-300">{inc.primary_user || 'N/A'}</span></div>
                    <div>Source IP: <span className="text-slate-300">{inc.primary_ip || 'N/A'}</span></div>
                    <div>{formatDateTime(inc.last_seen)}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Right Sidebar: Recent Uploads & Quick Scenarios */}
        <div className="space-y-6">
          {/* Live operational status (measured, not estimated) */}
          <OperationalStatusPanel />

          {/* Quick Scenario Previews */}
          <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>Evaluation Scenarios</span>
            </h3>
            <p className="text-xs text-slate-400">
              Deterministic synthetic test scenarios ready for instant review and demonstration:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="font-semibold text-white">1. Credential Stuffing / Brute Force</div>
                <div className="text-slate-400 text-[11px] mt-0.5">4 failed logins + successful login + data export (analyst01)</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="font-semibold text-white">2. Distributed Password Spray</div>
                <div className="text-slate-400 text-[11px] mt-0.5">Single IP spraying multiple accounts (203.0.113.88)</div>
              </div>

              <div className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="font-semibold text-white">3. Repeated Access Denied</div>
                <div className="text-slate-400 text-[11px] mt-0.5">Multiple authorization denials for contractor_jim</div>
              </div>
            </div>

            <Link
              href="/logs"
              className="block w-full text-center py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-cyan-400 border border-slate-700 transition-colors"
            >
              Test Custom Datasets →
            </Link>
          </div>

          {/* Recent Uploads */}
          <div className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-cyan-400" />
                <span>Recent Uploads</span>
              </h3>
              <Link href="/logs" className="text-xs text-cyan-400 hover:underline">
                View all
              </Link>
            </div>

            <div className="space-y-2.5">
              {uploads.length === 0 ? (
                <div className="text-xs text-slate-500 text-center py-3">No uploads yet</div>
              ) : (
                uploads.slice(0, 4).map((upl) => (
                  <div key={upl.upload_id} className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47] text-xs">
                    <div className="font-medium text-white truncate">{upl.filename}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 font-mono">
                      <span>{upl.accepted_rows} accepted</span>
                      {upl.rejected_rows > 0 && (
                        <span className="text-red-400">{upl.rejected_rows} rejected</span>
                      )}
                      <span>{formatDateTime(upl.created_at).slice(0, 11)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
