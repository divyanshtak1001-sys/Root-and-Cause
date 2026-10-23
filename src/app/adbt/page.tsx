'use client';

import React, { useState, useEffect } from 'react';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Play,
  Search,
  BookOpen,
  Terminal,
  Activity,
  Layers,
  Sparkles,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { AdbtHealthStatus } from '@/lib/adbt/adbt-types';

export default function AdbtDashboardPage() {
  const [health, setHealth] = useState<AdbtHealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Interactive Tool Runner State
  const [selectedTool, setSelectedTool] = useState<'search_documentation' | 'list_documents' | 'read_document'>(
    'search_documentation'
  );
  const [searchQuery, setSearchQuery] = useState('testing');
  const [docType, setDocType] = useState('WORKFLOW');
  const [docUri, setDocUri] = useState('amazon_devices_buildertools_mcp_release_notes.md');
  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState<unknown | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [execLatency, setExecLatency] = useState<number | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/adbt/status');
      const json = await res.json();
      if (json.success) {
        setHealth(json.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchHealth();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleExecuteTool = async () => {
    setExecuting(true);
    setExecError(null);
    setExecResult(null);
    const start = Date.now();

    let args: Record<string, unknown> = {};
    if (selectedTool === 'search_documentation') {
      args = {
        query: searchQuery,
        target_platform: { device_os: ['vega_os'] },
      };
    } else if (selectedTool === 'list_documents') {
      args = {
        documentType: docType,
        target_platform: { device_os: ['vega_os'] },
      };
    } else if (selectedTool === 'read_document') {
      args = {
        document_uri: docUri,
      };
    }

    try {
      const res = await fetch('/api/v1/adbt/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: selectedTool,
          args,
        }),
      });

      const json = await res.json();
      setExecLatency(Date.now() - start);

      if (json.success) {
        setExecResult(json.data);
      } else {
        setExecError(json.error || 'ADBT tool execution failed');
      }
    } catch (err: unknown) {
      setExecError((err as Error).message);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a47] pb-5">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-800 text-[10px] font-mono text-cyan-400 uppercase tracking-wider mb-2">
            <Cpu className="w-3 h-3" />
            <span>Official Amazon Tooling Integration</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>Amazon Devices Builder Tools (ADBT) Runtime Console</span>
          </h1>
          <p className="text-sm text-slate-400">
            Direct runtime integration with <code className="text-cyan-400 font-mono">@amazon-devices/amazon-devices-buildertools-mcp</code>.
            Allows programmatic invocation of MCP tools, diagnostic verification, and documentation queries.
          </p>
        </div>

        <button
          onClick={fetchHealth}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          <span>Refresh Status</span>
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Server Runtime Status
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`w-3 h-3 rounded-full ${
                health?.status === 'ONLINE'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-lg font-bold text-white font-mono">
              {health ? health.status : 'CHECKING...'}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Latency: {health?.executionLatencyMs ? `${health.executionLatencyMs}ms` : '—'}
          </div>
        </div>

        {/* Package Version */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Package Version
          </div>
          <div className="text-lg font-bold text-cyan-300 font-mono">
            {health?.version || '1.0.17'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            @amazon-devices/amazon-devices-buildertools-mcp
          </div>
        </div>

        {/* MCP Tools Available */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Registered MCP Tools
          </div>
          <div className="text-lg font-bold text-white font-mono">
            {health ? `${health.toolCount} Tools` : '9 Tools'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Available over stdio / exec
          </div>
        </div>

        {/* Steering Document */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Context Steering
          </div>
          <div className="text-base font-bold text-emerald-400 font-mono flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>{health?.contextDocumentVersion || 'v7.0 Active'}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            .gemini/GEMINI.md
          </div>
        </div>
      </div>

      {/* Interactive Tool Runner & Available Tools Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Interactive MCP Tool Runner (7 cols) */}
        <div className="lg:col-span-7 space-y-4 p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="flex items-center justify-between border-b border-[#1a2a47] pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <span>Interactive MCP Tool Invocation</span>
            </h2>
            <span className="text-[10px] text-slate-400 font-mono">Runs via server-side child_process</span>
          </div>

          <div className="space-y-3">
            {/* Tool Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Select ADBT Tool
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'search_documentation', label: 'search_documentation' },
                  { id: 'list_documents', label: 'list_documents' },
                  { id: 'read_document', label: 'read_document' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTool(t.id as typeof selectedTool)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-mono font-medium transition-colors text-center truncate ${
                      selectedTool === t.id
                        ? 'bg-cyan-950 border border-cyan-500 text-cyan-300 shadow-sm'
                        : 'bg-[#080c14] border border-[#1a2a47] text-slate-400 hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inputs based on selected tool */}
            {selectedTool === 'search_documentation' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full-Text Query String
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search query (e.g. testing, accessibility, migration)..."
                    className="w-full pl-9 pr-3 py-2 bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            )}

            {selectedTool === 'list_documents' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Filter by Document Type
                </label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                >
                  <option value="WORKFLOW">WORKFLOW (Step-by-step guides)</option>
                  <option value="KB">KB (Knowledge Base)</option>
                  <option value="PROMPT">PROMPT (Agent prompts)</option>
                  <option value="STEERING">STEERING (Architecture guidance)</option>
                  <option value="SKILL">SKILL (Agent skills)</option>
                </select>
              </div>
            )}

            {selectedTool === 'read_document' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Document URI
                </label>
                <input
                  type="text"
                  value={docUri}
                  onChange={(e) => setDocUri(e.target.value)}
                  placeholder="Document URI (e.g. amazon_devices_buildertools_mcp_release_notes.md)..."
                  className="w-full px-3 py-2 bg-[#080c14] border border-[#1a2a47] rounded-lg text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            {/* Execute Button */}
            <button
              onClick={handleExecuteTool}
              disabled={executing}
              className="w-full py-2 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              <Play className={`w-3.5 h-3.5 ${executing ? 'animate-spin' : ''}`} />
              <span>{executing ? 'Executing MCP Tool...' : `Execute '${selectedTool}'`}</span>
            </button>

            {/* Error Display */}
            {execError && (
              <div className="p-3 rounded-lg bg-red-950/70 border border-red-800 text-xs text-red-300 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="font-mono">{execError}</span>
              </div>
            )}

            {/* Output Display */}
            {execResult !== null && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                  <span className="text-cyan-400 font-bold">Execution Output:</span>
                  <span>Latency: {execLatency}ms</span>
                </div>
                <pre className="max-h-72 overflow-y-auto p-3.5 rounded-lg bg-[#080c14] border border-[#1a2a47] text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {typeof execResult === 'string'
                    ? execResult
                    : JSON.stringify(execResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right: Available MCP Tools Registry (5 cols) */}
        <div className="lg:col-span-5 space-y-3 p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] flex flex-col h-[650px]">
          <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>ADBT MCP Tools Registry</span>
          </h2>
          <p className="text-xs text-slate-400 shrink-0">
            Exposed tools verified from <code className="text-slate-300">amazon-devices-buildertools-mcp</code>:
          </p>

          <div className="space-y-2 flex-1 overflow-y-auto pr-1">
            {health?.availableTools && health.availableTools.length > 0 ? (
              health.availableTools.map((tool) => (
                <div
                  key={tool.name}
                  className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47] text-xs font-mono space-y-1"
                >
                  <div className="font-bold text-cyan-300">{tool.name}</div>
                  <p className="text-slate-400 text-[11px] font-sans line-clamp-3">
                    {tool.description}
                  </p>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-slate-500 text-xs font-mono">
                Loading available tool definitions...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
