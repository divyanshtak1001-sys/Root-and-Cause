import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(prefix: string = 'id'): string {
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }) + ' UTC';
  } catch {
    return isoString;
  }
}

export function getSeverityBadgeClass(severity: string): string {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return 'bg-red-950/80 text-red-400 border-red-800/80';
    case 'HIGH':
      return 'bg-orange-950/80 text-orange-400 border-orange-800/80';
    case 'MEDIUM':
      return 'bg-amber-950/80 text-amber-400 border-amber-800/80';
    case 'LOW':
    default:
      return 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80';
  }
}

export function getRiskScoreColor(score: number): string {
  if (score >= 75) return 'text-red-400';
  if (score >= 50) return 'text-orange-400';
  if (score >= 25) return 'text-amber-400';
  return 'text-emerald-400';
}

export function getStatusBadgeClass(status: string): string {
  switch (status?.toUpperCase()) {
    case 'NEW':
      return 'bg-cyan-950/70 text-cyan-400 border-cyan-800/60';
    case 'TRIAGED':
      return 'bg-blue-950/70 text-blue-400 border-blue-800/60';
    case 'INVESTIGATING':
      return 'bg-purple-950/70 text-purple-400 border-purple-800/60';
    case 'CONTAINED':
      return 'bg-indigo-950/70 text-indigo-400 border-indigo-800/60';
    case 'CLOSED':
      return 'bg-slate-800/70 text-slate-400 border-slate-700/60';
    default:
      return 'bg-slate-800/70 text-slate-400 border-slate-700/60';
  }
}
