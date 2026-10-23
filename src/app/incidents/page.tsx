'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Search,
  Filter,
  ArrowRight,
  TrendingUp,
  Clock,
  User,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { Incident } from '@/types';
import {
  getSeverityBadgeClass,
  getStatusBadgeClass,
  getRiskScoreColor,
  formatDateTime,
} from '@/lib/utils';

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/v1/incidents?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setIncidents(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) fetchIncidents();
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [severityFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchIncidents();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a47] pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-cyan-400" />
            <span>Incident Queue</span>
          </h1>
          <p className="text-sm text-slate-400">
            Correlated multi-event security incidents with deterministic risk scores and verification timelines.
          </p>
        </div>

        <button
          onClick={fetchIncidents}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by username, IP, host, or incident title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
        </form>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500 font-medium"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500 font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="TRIAGED">Triaged</option>
            <option value="INVESTIGATING">Investigating</option>
            <option value="CONTAINED">Contained</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {loading ? (
          <div className="p-12 text-center text-slate-400 font-mono text-xs">
            Loading incidents from data store...
          </div>
        ) : incidents.length === 0 ? (
          <div className="p-12 text-center rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3">
            <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-slate-300 font-medium">No incidents match the selected filters</p>
            <p className="text-xs text-slate-500">
              Try adjusting your search criteria, or go to Ingestion to load a sample dataset.
            </p>
          </div>
        ) : (
          incidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/incidents/${inc.id}`}
              className="block p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] hover:border-cyan-600/70 hover:bg-[#111c35] transition-all group shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                {/* Left Section */}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-semibold border ${getSeverityBadgeClass(inc.severity)}`}>
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
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border font-mono ${getStatusBadgeClass(inc.status)}`}>
                      {inc.status}
                    </span>
                    <span className="font-mono text-xs text-cyan-400 font-semibold">
                      {inc.id}
                    </span>
                    <span className="text-xs text-slate-400">
                      • {inc.event_count} supporting events
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors">
                    {inc.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {inc.summary}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{inc.primary_user || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{inc.primary_ip || '0.0.0.0'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      <span>{formatDateTime(inc.first_seen)} → {formatDateTime(inc.last_seen)}</span>
                    </div>
                  </div>
                </div>

                {/* Right Section: Risk Meter & Arrow */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-[#1a2a47] pt-3 sm:pt-0 shrink-0">
                  <div className="text-left sm:text-right">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">Risk Score</div>
                    <div className={`text-2xl font-black font-mono flex items-baseline sm:justify-end gap-1 ${getRiskScoreColor(inc.risk_score)}`}>
                      {inc.risk_score}
                      <span className="text-xs text-slate-500 font-normal">/100</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">Confidence: {inc.confidence}%</div>
                  </div>

                  <div className="mt-2 text-cyan-400 group-hover:translate-x-1 transition-transform hidden sm:block">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
