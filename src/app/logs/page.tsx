'use client';

import React, { useState, useEffect } from 'react';
import {
  UploadCloud,
  FileCode,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  FileText,
  Download,
  Database,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { IngestSummary, NormalizedLogEvent } from '@/types';
import { formatDateTime } from '@/lib/utils';

export default function LogsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const [sampleEvents, setSampleEvents] = useState<NormalizedLogEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentUploads, setRecentUploads] = useState<IngestSummary[]>([]);

  const fetchRecentUploads = async () => {
    try {
      const res = await fetch('/api/v1/uploads');
      const json = await res.json();
      if (json.success) setRecentUploads(json.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchRecentUploads();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setErrorMessage(null);
    }
  };

  const uploadContent = async (content: string, filename: string) => {
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, filename }),
      });
      const json = await res.json();
      if (json.success) {
        setSummary(json.data.summary);
        setSampleEvents(json.data.sampleEvents);
        fetchRecentUploads();
      } else {
        setErrorMessage(json.error || 'Failed to ingest log data');
      }
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      await uploadContent(text, file.name);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message);
      setIsUploading(false);
    }
  };

  const loadSampleDataset = async (url: string, filename: string) => {
    try {
      setIsUploading(true);
      const res = await fetch(url);
      const text = await res.text();
      await uploadContent(text, filename);
    } catch (err: unknown) {
      setErrorMessage(`Failed to load sample: ${(err as Error).message}`);
      setIsUploading(false);
    }
  };

  const downloadErrorSummary = () => {
    if (!summary || summary.errors.length === 0) return;
    const blob = new Blob([JSON.stringify(summary.errors, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error_summary_${summary.upload_id}.json`;
    a.click();
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Page Title */}
      <div className="border-b border-[#1a2a47] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <UploadCloud className="w-6 h-6 text-cyan-400" />
          <span>Security Log Ingestion</span>
        </h1>
        <p className="text-sm text-slate-400">
          Upload JSON or CSV security event logs. The engine validates formats, normalizes timestamps to UTC, executes deterministic detection rules, and correlates incidents.
        </p>
      </div>

      {/* Upload & Quick Preset Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form Box (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <form
            onSubmit={handleFileUpload}
            className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-4"
          >
            <h2 className="text-base font-bold text-white">Select Security Log File</h2>

            <div className="border-2 border-dashed border-[#1e3a5f] rounded-xl p-8 text-center bg-[#080c14]/60 hover:border-cyan-500/50 transition-colors">
              <UploadCloud className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
              <p className="text-sm text-slate-300 font-medium mb-1">
                Drag and drop your CSV or JSON log file here, or click to browse
              </p>
              <p className="text-xs text-slate-500 mb-4">
                Supported formats: CSV, JSON. Maximum 5,000 events / 15MB per batch.
              </p>

              <input
                type="file"
                accept=".csv,.json,application/json,text/csv"
                onChange={handleFileChange}
                className="text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-cyan-950 file:text-cyan-400 hover:file:bg-cyan-900 cursor-pointer"
              />
            </div>

            {file && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#080c14] border border-[#1a2a47] text-xs">
                <span className="font-mono text-cyan-300 truncate">{file.name}</span>
                <span className="text-slate-400 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
            )}

            {errorMessage && (
              <div className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || isUploading}
              className="w-full py-2.5 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <UploadCloud className="w-4 h-4" />
              <span>{isUploading ? 'Validating & Ingesting...' : 'Upload & Analyze Logs'}</span>
            </button>
          </form>
        </div>

        {/* Quick Sample Presets */}
        <div className="space-y-4">
          <div className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <span>1-Click Sample Datasets</span>
            </h3>
            <p className="text-xs text-slate-400">
              Instantly test and demonstrate the complete detection and AI investigation workflow using pre-packaged test cases:
            </p>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() =>
                  loadSampleDataset('/samples/synthetic_auth_brute_force.json', 'synthetic_auth_brute_force.json')
                }
                disabled={isUploading}
                className="w-full text-left p-3 rounded-lg bg-[#080c14] border border-[#1a2a47] hover:border-cyan-700 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-white group-hover:text-cyan-300">
                    Brute Force → Success → Exfil
                  </div>
                  <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  JSON with 4 failures, successful authentication, and data export.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  loadSampleDataset('/samples/synthetic_password_spray.csv', 'synthetic_password_spray.csv')
                }
                disabled={isUploading}
                className="w-full text-left p-3 rounded-lg bg-[#080c14] border border-[#1a2a47] hover:border-cyan-700 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-white group-hover:text-cyan-300">
                    Distributed Password Spray
                  </div>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  CSV log with 1 IP attacking multiple employee accounts.
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  loadSampleDataset(
                    '/samples/synthetic_malformed_and_injection.csv',
                    'synthetic_malformed_and_injection.csv'
                  )
                }
                disabled={isUploading}
                className="w-full text-left p-3 rounded-lg bg-[#080c14] border border-[#1a2a47] hover:border-cyan-700 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-white group-hover:text-cyan-300">
                    Malformed & Injection Test
                  </div>
                  <AlertCircle className="w-3.5 h-3.5 text-orange-400" />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Tests missing fields error reporting + prompt injection resistance.
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Ingestion Summary Results */}
      {summary && (
        <div className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a47] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <h2 className="text-lg font-bold text-white">Ingestion Results: {summary.filename}</h2>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">Upload ID: {summary.upload_id}</p>
            </div>

            <Link
              href="/incidents"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs transition-colors"
            >
              <span>View Correlated Incidents</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Stats Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#080c14] border border-[#1a2a47]">
              <div className="text-xs text-slate-400">Total Rows Processed</div>
              <div className="text-xl font-bold font-mono text-white mt-1">{summary.total_rows}</div>
            </div>

            <div className="p-4 rounded-lg bg-[#080c14] border border-[#1a2a47]">
              <div className="text-xs text-slate-400">Accepted & Normalized</div>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">{summary.accepted_rows}</div>
            </div>

            <div className="p-4 rounded-lg bg-[#080c14] border border-[#1a2a47]">
              <div className="text-xs text-slate-400">Rejected / Malformed</div>
              <div className="text-xl font-bold font-mono text-red-400 mt-1">{summary.rejected_rows}</div>
            </div>
          </div>

          {/* Actionable Error Reporting */}
          {summary.errors.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Validation Errors ({summary.errors.length})</span>
                </h3>
                <button
                  onClick={downloadErrorSummary}
                  className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 px-2.5 py-1 rounded border border-slate-700"
                >
                  <Download className="w-3 h-3 text-cyan-400" />
                  <span>Download Error JSON</span>
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-lg border border-red-900/40 bg-red-950/20 divide-y divide-red-900/30 text-xs">
                {summary.errors.map((err, i) => (
                  <div key={i} className="p-2.5 flex items-start gap-3">
                    <span className="font-mono font-semibold text-red-400 shrink-0">Row {err.row}</span>
                    <span className="text-slate-300">{err.reason}</span>
                    {err.raw && (
                      <span className="text-slate-500 font-mono text-[10px] ml-auto truncate max-w-xs">{err.raw}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sample Events Table Preview */}
          {sampleEvents.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Ingested Events Preview</span>
              </h3>

              <div className="overflow-x-auto rounded-lg border border-[#1a2a47]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#080c14] text-slate-400 font-mono uppercase text-[10px] border-b border-[#1a2a47]">
                    <tr>
                      <th className="p-2.5">Event ID</th>
                      <th className="p-2.5">Timestamp (UTC)</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">User</th>
                      <th className="p-2.5">Source IP</th>
                      <th className="p-2.5">Host</th>
                      <th className="p-2.5">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a2a47]/60 font-mono">
                    {sampleEvents.map((ev) => (
                      <tr key={ev.event_id} className="hover:bg-[#111c35]">
                        <td className="p-2.5 text-cyan-300 font-semibold">{ev.event_id}</td>
                        <td className="p-2.5 text-slate-300">{formatDateTime(ev.timestamp)}</td>
                        <td className="p-2.5 text-slate-200">{ev.event_type}</td>
                        <td className="p-2.5 text-slate-200">{ev.username}</td>
                        <td className="p-2.5 text-slate-300">{ev.source_ip}</td>
                        <td className="p-2.5 text-slate-400">{ev.host}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              ev.result === 'SUCCESS'
                                ? 'bg-emerald-950 text-emerald-400'
                                : ev.result === 'FAILURE'
                                ? 'bg-red-950 text-red-400'
                                : 'bg-amber-950 text-amber-400'
                            }`}
                          >
                            {ev.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
