'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ShieldAlert,
  Bot,
  Sparkles,
  ArrowLeft,
  Volume2,
  VolumeX,
  Send,
  FileText,
  Clock,
  User,
  Globe,
  Server,
  AlertTriangle,
  CheckCircle2,
  Download,
  Terminal,
  ExternalLink,
  Code,
  HelpCircle,
} from 'lucide-react';
import { Incident, NormalizedLogEvent, InvestigationReport, ChatMessage, IncidentStatus } from '@/types';
import {
  getSeverityBadgeClass,
  getStatusBadgeClass,
  getRiskScoreColor,
  formatDateTime,
} from '@/lib/utils';

function IncidentDetailContent() {
  const params = useParams();
  const incidentId = params.incidentId as string;

  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<NormalizedLogEvent[]>([]);
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Conversational Assistant State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isInvestigating, setIsInvestigating] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchIncidentDetails = async () => {
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}`);
      const json = await res.json();
      if (json.success) {
        setIncident(json.data.incident);
        setEvents(json.data.events);
        if (json.data.report) {
          setReport(json.data.report);
        }

        // Initialize greeting message if empty
        if (messages.length === 0) {
          setMessages([
            {
              id: 'init_msg',
              role: 'assistant',
              content: `Root & Reason SOC Assistant active. I have loaded ${json.data.events.length} verified log records for incident ${incidentId} (${json.data.incident.title}). You can ask me to analyze the attack progression, explain the risk score, or generate an evidence report.`,
              timestamp: new Date().toISOString(),
              suggested_actions: [
                'Show me the evidence behind the high risk score.',
                'What happened before the successful login?',
                'Which events support the account-compromise hypothesis?',
                'Check Amazon ADBT platform guidelines for this incident.',
                'What should an analyst verify next?',
                'Generate the investigation report.',
              ],
            },
          ]);
        }
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
      if (!cancelled) fetchIncidentDetails();
    });
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isInvestigating]);

  const handleStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setIncident({ ...incident, status: newStatus });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const speakText = (text: string) => {
    if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  };

  const handleSendQuery = async (queryText?: string) => {
    const text = queryText || inputQuery;
    if (!text.trim() || isInvestigating) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setIsInvestigating(true);

    // If query is to generate report, trigger report generator
    if (text.toLowerCase().includes('generate') && text.toLowerCase().includes('report')) {
      await handleGenerateReport();
      setIsInvestigating(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          history: messages,
        }),
      });

      const json = await res.json();
      if (json.success) {
        const data = json.data;
        const assistantMsg: ChatMessage = {
          id: `ast_${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          timestamp: new Date().toISOString(),
          facts: data.facts,
          hypotheses: data.hypotheses,
          recommendations: data.recommendations,
          evidence_ids: data.evidence_ids,
          suggested_actions: data.suggested_actions,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        speakText(data.answer);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            content: `Error during investigation: ${json.error}`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          content: `Connection error: ${(err as Error).message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleGenerateReport = async () => {
    setIsGeneratingReport(true);
    try {
      const res = await fetch(`/api/v1/incidents/${incidentId}/report`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setReport(json.data.report);
        setShowReportModal(true);

        const method = json.data.usedFallback
          ? 'deterministic security verification engine (fallback)'
          : 'Google Gemini AI';

        const notifyMsg: ChatMessage = {
          id: `rep_notif_${Date.now()}`,
          role: 'assistant',
          content: `Investigation Report successfully generated via ${method}. The report contains full chronological timeline verification, observed findings, and recommended containment steps.`,
          timestamp: new Date().toISOString(),
          evidence_ids: json.data.report.evidence_references,
          suggested_actions: [
            'What should an analyst verify next?',
            'Show me the evidence behind the high risk score.',
          ],
        };
        setMessages((prev) => [...prev, notifyMsg]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const downloadMarkdownReport = () => {
    if (!report) return;
    const md = `# Investigation Report: ${report.title}
**Incident ID:** ${report.incident_id}
**Severity:** ${report.severity}
**Risk Score:** ${report.risk_score}/100 (Confidence: ${report.confidence_score}%)
**Generation Method:** ${report.generation_method} (${report.model})
**Generated At:** ${report.generated_at}

## Executive Summary
${report.executive_summary}

## Observed Evidence & Findings
${report.observations.map((o) => `- ${o}`).join('\n')}

## Chronological Event Progression
${report.event_timeline
  .map((t) => `### [${t.timestamp}] Event ID: ${t.event_id}\n- **Summary:** ${t.summary}\n- **Significance:** ${t.significance}`)
  .join('\n\n')}

## Analytical Hypotheses
${report.likely_explanations.map((h) => `- ${h}`).join('\n')}

## Uncertainties & Limitations
${report.uncertainty.map((u) => `- ${u}`).join('\n')}

## Recommended Verification & Containment
${report.recommended_verification_steps.map((r) => `- [ ] ${r}`).join('\n')}

## Relevant MITRE ATT&CK Techniques
${report.relevant_attack_techniques.map((t) => `- ${t}`).join('\n')}

---
*Generated by Root & Reason — AI Incident Investigator*
`;

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Investigation_Report_${incidentId}.md`;
    a.click();
  };

  if (loading || !incident) {
    return (
      <div className="p-12 text-center text-slate-400 font-mono text-sm animate-pulse">
        Loading incident {incidentId} evidence bundle...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back Link & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1a2a47] pb-5">
        <div className="space-y-1">
          <Link
            href="/incidents"
            className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Incident Queue</span>
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-white tracking-tight">{incident.title}</h1>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${getSeverityBadgeClass(incident.severity)}`}>
              {incident.severity}
            </span>
            <span className="font-mono text-xs text-slate-400">{incident.id}</span>
          </div>
        </div>

        {/* Status Dropdown & Report CTA */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Status:</span>
            <select
              value={incident.status}
              onChange={(e) => handleStatusChange(e.target.value as IncidentStatus)}
              className="bg-[#0d1527] border border-[#1a2a47] rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-cyan-500 font-medium font-mono"
            >
              <option value="NEW">NEW</option>
              <option value="TRIAGED">TRIAGED</option>
              <option value="INVESTIGATING">INVESTIGATING</option>
              <option value="CONTAINED">CONTAINED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <button
            onClick={handleGenerateReport}
            disabled={isGeneratingReport}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition-colors shadow-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            <span>{isGeneratingReport ? 'Generating Report...' : report ? 'View Report' : 'Generate Report'}</span>
          </button>
        </div>
      </div>

      {/* Incident Metadata & Risk Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Risk Score Gauge */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Deterministic Risk Score
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold font-mono ${getRiskScoreColor(incident.risk_score)}`}>
              {incident.risk_score}
            </span>
            <span className="text-xs text-slate-500 font-normal">/ 100</span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-1">
            Confidence: {incident.confidence}% • Evidence: {events.length} records
          </div>
        </div>

        {/* Primary User */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-cyan-400" />
            <span>Target Account</span>
          </div>
          <div className="text-base font-bold text-white font-mono truncate">
            {incident.primary_user || 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Single account focus</div>
        </div>

        {/* Primary Source IP */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Source Origin IP</span>
          </div>
          <div className="text-base font-bold text-white font-mono truncate">
            {incident.primary_ip || 'N/A'}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Remote connection origin</div>
        </div>

        {/* Activity Window */}
        <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47]">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>Investigation Window</span>
          </div>
          <div className="text-xs font-mono text-slate-200">
            {formatDateTime(incident.first_seen)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
            to {formatDateTime(incident.last_seen)}
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Left = Conversational Assistant | Right = Timeline & Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Alexa+ Simulated Conversational Assistant (6 cols) */}
        <div className="lg:col-span-6 space-y-4 flex flex-col h-[750px] bg-[#0d1527] rounded-xl border border-[#1a2a47] p-5 shadow-lg">
          {/* Assistant Header */}
          <div className="flex items-center justify-between border-b border-[#1a2a47] pb-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-700/60 flex items-center justify-center text-cyan-400 shadow-sm">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Alexa+ Simulated Copilot</span>
                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                    Live
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">Grounded in verified event records</div>
              </div>
            </div>

            {/* TTS Toggle */}
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              title={ttsEnabled ? 'Mute voice simulation' : 'Enable voice simulation'}
              className={`p-2 rounded-lg border text-xs flex items-center gap-1.5 transition-colors ${
                ttsEnabled
                  ? 'bg-cyan-950 border-cyan-600 text-cyan-400 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span className="text-[11px]">{ttsEnabled ? 'Voice On' : 'Voice Off'}</span>
            </button>
          </div>

          {/* Chat Messages Stream */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col text-xs leading-relaxed ${
                  msg.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[92%] rounded-xl p-3.5 space-y-2.5 ${
                    msg.role === 'user'
                      ? 'bg-cyan-600 text-white rounded-br-none shadow-sm'
                      : 'bg-[#080c14] border border-[#1a2a47] text-slate-200 rounded-bl-none'
                  }`}
                >
                  <p className="font-medium whitespace-pre-wrap">{msg.content}</p>

                  {/* Structured Sections if available */}
                  {msg.facts && msg.facts.length > 0 && (
                    <div className="pt-2 border-t border-[#1a2a47]/60 space-y-1">
                      <div className="text-[11px] font-bold text-cyan-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Verified Facts:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                        {msg.facts.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.hypotheses && msg.hypotheses.length > 0 && (
                    <div className="pt-2 border-t border-[#1a2a47]/60 space-y-1">
                      <div className="text-[11px] font-bold text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Analytical Hypotheses:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                        {msg.hypotheses.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="pt-2 border-t border-[#1a2a47]/60 space-y-1">
                      <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Recommended Verification:</span>
                      </div>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
                        {msg.recommendations.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Cited Evidence IDs */}
                  {msg.evidence_ids && msg.evidence_ids.length > 0 && (
                    <div className="pt-2 border-t border-[#1a2a47]/60 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400 font-mono">Proof:</span>
                      {msg.evidence_ids.map((id) => (
                        <button
                          key={id}
                          onClick={() => setSelectedEventId(id)}
                          className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-[10px] text-cyan-300 font-mono hover:bg-cyan-900 transition-colors"
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Suggested Action Chips */}
                {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-w-[95%]">
                    {msg.suggested_actions.map((chip, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendQuery(chip)}
                        disabled={isInvestigating}
                        className="text-[11px] text-cyan-300 bg-slate-800/80 hover:bg-slate-700 hover:text-white px-2.5 py-1 rounded-full border border-slate-700 transition-colors text-left disabled:opacity-50"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isInvestigating && (
              <div className="flex items-center gap-2 p-3 bg-[#080c14] border border-[#1a2a47] rounded-xl text-xs text-cyan-400 font-mono animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>Simulating Alexa+ SOC query & verifying backend records...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Query Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendQuery();
            }}
            className="flex items-center gap-2 pt-2 border-t border-[#1a2a47] shrink-0"
          >
            <input
              type="text"
              placeholder="Ask Alexa+ (e.g. 'What happened before the successful login?')..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              disabled={isInvestigating}
              className="flex-1 bg-[#080c14] border border-[#1a2a47] rounded-lg px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isInvestigating}
              className="p-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-50 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Right Column: Timeline & Evidence Records (6 cols) */}
        <div className="lg:col-span-6 space-y-4 flex flex-col h-[750px]">
          {/* Triggered Detections Box */}
          <div className="p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-2.5 shrink-0">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              <span>Triggered Security Rules ({incident.detections.length})</span>
            </h2>

            <div className="space-y-2">
              {incident.detections.map((det) => (
                <div
                  key={det.rule_id}
                  className="p-2.5 rounded-lg bg-[#080c14] border border-[#1a2a47] text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{det.rule_name}</span>
                    <span className="font-mono text-[10px] text-cyan-400">+{det.contributing_score} score</span>
                  </div>
                  <p className="text-slate-400 text-[11px]">{det.description}</p>
                  {det.mitre_attack_id && (
                    <div className="text-[10px] text-cyan-400 font-mono">
                      ATT&CK: {det.mitre_attack_id}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chronological Event Timeline & Table */}
          <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3 flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <span>Verified Event Records ({events.length})</span>
              </h2>
              {selectedEventId && (
                <button
                  onClick={() => setSelectedEventId(null)}
                  className="text-[10px] text-cyan-400 hover:underline font-mono"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="space-y-2.5 flex-1 overflow-y-auto pr-1">
              {events.map((ev, idx) => {
                const isSelected = selectedEventId === ev.event_id;
                return (
                  <div
                    key={ev.event_id}
                    id={`event-${ev.event_id}`}
                    onClick={() => setSelectedEventId(ev.event_id)}
                    className={`p-3 rounded-lg border transition-all cursor-pointer text-xs font-mono ${
                      isSelected
                        ? 'bg-cyan-950/60 border-cyan-500 shadow-md ring-1 ring-cyan-500'
                        : 'bg-[#080c14] border-[#1a2a47] hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px]">#{idx + 1}</span>
                        <span className="font-semibold text-cyan-300">{ev.event_id}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            ev.result === 'SUCCESS'
                              ? 'bg-emerald-950 text-emerald-400'
                              : ev.result === 'FAILURE'
                              ? 'bg-red-950 text-red-400'
                              : 'bg-amber-950 text-amber-400'
                          }`}
                        >
                          {ev.result}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">{formatDateTime(ev.timestamp)}</span>
                    </div>

                    <div className="text-white font-medium text-[11px] mb-1">
                      {ev.event_type}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 pt-1 border-t border-[#1a2a47]/60">
                      <div>User: <span className="text-slate-200">{ev.username}</span></div>
                      <div>IP: <span className="text-slate-200">{ev.source_ip}</span></div>
                      <div>Host: <span className="text-slate-200">{ev.host}</span></div>
                    </div>

                    {/* Raw payload toggle/viewer if selected */}
                    {isSelected && ev.raw_payload && (
                      <div className="mt-2 pt-2 border-t border-cyan-800/60">
                        <div className="text-[10px] text-cyan-400 font-bold mb-1 flex items-center gap-1">
                          <Code className="w-3 h-3" />
                          <span>Raw Payload:</span>
                        </div>
                        <pre className="p-2 rounded bg-black/60 text-[10px] text-slate-300 overflow-x-auto">
                          {typeof ev.raw_payload === 'string'
                            ? ev.raw_payload
                            : JSON.stringify(ev.raw_payload, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="max-w-4xl w-full max-h-[90vh] bg-[#0d1527] border border-[#1a2a47] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#1a2a47] flex items-center justify-between bg-[#080c14]">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" />
                  <span>Investigation Report</span>
                </h2>
                <div className="text-xs text-slate-400 font-mono mt-0.5">
                  Generated via {report.generation_method} ({report.model})
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={downloadMarkdownReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Export Markdown</span>
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300 leading-relaxed font-sans">
              {/* Title & Metadata */}
              <div className="space-y-1 border-b border-[#1a2a47] pb-4">
                <h3 className="text-base font-bold text-white">{report.title}</h3>
                <div className="flex items-center gap-3 text-xs font-mono text-slate-400">
                  <span>Incident: {report.incident_id}</span>
                  <span>•</span>
                  <span>Severity: <strong className="text-red-400">{report.severity}</strong></span>
                  <span>•</span>
                  <span>Risk Score: {report.risk_score}/100</span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Executive Summary
                </h4>
                <p className="p-3.5 rounded-lg bg-[#080c14] border border-[#1a2a47] text-slate-200 text-xs">
                  {report.executive_summary}
                </p>
              </div>

              {/* Observations */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Observed Facts & Evidence Findings
                </h4>
                <ul className="list-disc list-inside space-y-1 p-3.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                  {report.observations.map((o, idx) => (
                    <li key={idx} className="text-slate-300">{o}</li>
                  ))}
                </ul>
              </div>

              {/* Chronological Event Progression */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                  Chronological Event Progression
                </h4>
                <div className="space-y-2">
                  {report.event_timeline.map((item) => (
                    <div key={item.event_id} className="p-3 rounded-lg bg-[#080c14] border border-[#1a2a47] font-mono text-xs">
                      <div className="flex items-center justify-between text-cyan-300 font-semibold mb-1">
                        <span>Event: {item.event_id}</span>
                        <span className="text-slate-400">{formatDateTime(item.timestamp)}</span>
                      </div>
                      <div className="text-white text-[11px] mb-1">{item.summary}</div>
                      <div className="text-slate-400 text-[10px]">Significance: {item.significance}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Likely Explanations */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Analytical Hypotheses & Explanations
                </h4>
                <ul className="list-disc list-inside space-y-1 p-3.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                  {report.likely_explanations.map((h, idx) => (
                    <li key={idx} className="text-slate-300">{h}</li>
                  ))}
                </ul>
              </div>

              {/* Recommended Verification Steps */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Recommended Verification & Containment
                </h4>
                <ul className="list-disc list-inside space-y-1 p-3.5 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                  {report.recommended_verification_steps.map((s, idx) => (
                    <li key={idx} className="text-slate-300">{s}</li>
                  ))}
                </ul>
              </div>

              {/* MITRE ATT&CK */}
              {report.relevant_attack_techniques.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                    Relevant MITRE ATT&CK Techniques
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {report.relevant_attack_techniques.map((tech) => (
                      <span key={tech} className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono text-xs">
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IncidentDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-12 text-center text-slate-400 font-mono text-xs animate-pulse">
          Loading incident workstation...
        </div>
      }
    >
      <IncidentDetailContent />
    </React.Suspense>
  );
}

