import Link from 'next/link';
import {
  ShieldAlert,
  ArrowRight,
  UploadCloud,
  Bot,
  FileCheck,
  CheckCircle2,
  Lock,
  Cpu,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center max-w-4xl mx-auto">
      {/* Track & Status Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/70 border border-cyan-800 text-cyan-400 text-xs font-mono uppercase tracking-wider mb-6">
        <Cpu className="w-3.5 h-3.5" />
        Amazon Developer Hackathon — Alexa+ Simulated Track
      </div>

      <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white mb-6">
        Root <span className="text-cyan-400">&</span> Reason
      </h1>

      <p className="text-xl text-slate-300 max-w-2xl mb-8 leading-relaxed">
        Evidence-backed AI incident investigator. Upload security logs, detect suspicious credential sequences, correlate timeline events, and query a simulated Alexa+ SOC assistant grounded in actual backend records.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-base transition-all shadow-lg shadow-cyan-500/20"
        >
          <span>Open SOC Workstation</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
        <Link
          href="/logs"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-base transition-all"
        >
          <UploadCloud className="w-4 h-4 text-cyan-400" />
          <span>Upload Security Logs</span>
        </Link>
      </div>

      {/* 3 Pillar Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left w-full">
        <div className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] hover:border-cyan-800/80 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-cyan-950/60 border border-cyan-800 text-cyan-400 flex items-center justify-center mb-4">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Deterministic Detections</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            TypeScript security rules detect brute force, distributed password sprays, successful logins post-failure, and suspicious post-compromise exports.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] hover:border-cyan-800/80 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-400 flex items-center justify-center mb-4">
            <Bot className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Alexa+ Simulated Copilot</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Multi-turn conversational investigation driven by Google Gemini with strict prompt injection resistance and zero-hallucination evidence verification.
          </p>
        </div>

        <div className="p-6 rounded-xl bg-[#0d1527] border border-[#1a2a47] hover:border-cyan-800/80 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-400 flex items-center justify-center mb-4">
            <FileCheck className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Evidence-Backed Reports</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Comprehensive audit reports with chronological timelines, cited event IDs, MITRE ATT&CK mapping, and guaranteed deterministic fallback.
          </p>
        </div>
      </div>
    </div>
  );
}
