'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShieldAlert,
  Activity,
  FileText,
  UploadCloud,
  Sliders,
  RotateCcw,
  Bot,
  Sparkles,
  Cpu,
} from 'lucide-react';

export function Navbar() {
  const pathname = usePathname();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedNotice, setSeedNotice] = useState<string | null>(null);

  const handleSeed = async () => {
    setIsSeeding(true);
    setSeedNotice(null);
    try {
      const res = await fetch('/api/v1/demo/seed', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setSeedNotice('Seeded demo dataset!');
        setTimeout(() => setSeedNotice(null), 3000);
        window.location.reload();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSeeding(false);
    }
  };

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: Activity },
    { label: 'Ingestion', href: '/logs', icon: UploadCloud },
    { label: 'Incidents', href: '/incidents', icon: ShieldAlert },
    { label: 'Detection Rules', href: '/rules', icon: Sliders },
    { label: 'Reports', href: '/reports', icon: FileText },
    { label: 'Amazon ADBT', href: '/adbt', icon: Cpu },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#1a2a47] bg-[#080c14]/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400 group-hover:border-cyan-400 transition-all shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                <ShieldAlert className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-tight text-white text-lg">Root & Reason</span>
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                    SOC AI
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono">AI Incident Investigator</p>
              </div>
            </Link>

            {/* Navigation Links */}
            <nav className="hidden md:flex items-center gap-1 ml-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-cyan-950/60 text-cyan-400 border border-cyan-800/60 shadow-sm'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Bar */}
          <div className="flex items-center gap-3">
            {/* Alexa+ Simulated badge */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-cyan-950/40 border border-cyan-700/50 text-xs text-cyan-300">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="font-medium">Alexa+ Copilot</span>
              <span className="text-[10px] text-cyan-400/80 font-mono uppercase bg-cyan-900/60 px-1 rounded">Simulated</span>
            </div>

            {/* Re-seed button */}
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              title="Reset sample dataset to verify detection and investigation flows"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 rounded-md transition-all disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isSeeding ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
              <span>{isSeeding ? 'Seeding...' : 'Seed Data'}</span>
            </button>

            {seedNotice && (
              <span className="text-xs text-emerald-400 font-mono animate-fade-in">
                {seedNotice}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
