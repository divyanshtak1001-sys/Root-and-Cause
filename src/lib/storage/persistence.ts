import { dataStore } from '@/lib/storage/data-store';
import * as supabaseStore from '@/lib/storage/supabase-store';
import type {
  NormalizedLogEvent,
  IngestSummary,
  Incident,
  InvestigationReport,
  IncidentStatus,
} from '@/types';

/**
 * Persistence facade used by API routes.
 *
 * Supabase is the source of truth when a service-role key is configured and the
 * query succeeds. If Supabase is unconfigured or a read fails, we transparently
 * fall back to the in-memory store so the demo never goes dark.
 *
 * Writes always update the in-memory copy first (the UI reads through here and the
 * demo must stay responsive); the Supabase write is then applied as the durable copy.
 */

export type PersistenceMode = 'supabase' | 'memory';

function isSupabaseActive(): boolean {
  return supabaseStore.isPersistenceEnabled();
}

export function getPersistenceMode(): PersistenceMode {
  return isSupabaseActive() ? 'supabase' : 'memory';
}

export async function listUploads(): Promise<IngestSummary[]> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getUploads();
    if (remote) return remote.length > 0 ? remote : dataStore.getUploads();
  }
  return dataStore.getUploads();
}

export async function getUpload(uploadId: string): Promise<IngestSummary | undefined> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getUpload(uploadId);
    if (remote !== undefined) return remote ?? undefined;
  }
  return dataStore.getUpload(uploadId);
}

export async function listEvents(uploadId?: string): Promise<NormalizedLogEvent[]> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getEvents(uploadId);
    if (remote) return remote;
  }
  return dataStore.getEvents(uploadId);
}

export async function getEventsByIds(ids: string[]): Promise<NormalizedLogEvent[]> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getEventsByIds(ids);
    if (remote) return remote;
  }
  return dataStore.getEventsByIds(ids);
}

export async function listIncidents(): Promise<Incident[]> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getIncidents();
    if (remote && remote.length > 0) return remote;
  }
  return dataStore.getIncidents();
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getIncident(id);
    if (remote !== undefined) return remote ?? undefined;
  }
  return dataStore.getIncident(id);
}

export async function createUpload(
  summary: IngestSummary,
  events: NormalizedLogEvent[]
): Promise<{ persisted: boolean }> {
  dataStore.saveUpload(summary, events);
  if (!isSupabaseActive()) return { persisted: false };
  const persisted = await supabaseStore.saveUpload(summary, events);
  return { persisted };
}

export async function removeUpload(uploadId: string): Promise<boolean> {
  const removedLocally = dataStore.deleteUpload(uploadId);
  if (!isSupabaseActive()) return removedLocally;
  const removedRemotely = await supabaseStore.deleteUpload(uploadId);
  return removedLocally || removedRemotely;
}

export async function upsertIncidents(incidents: Incident[]): Promise<{ persisted: boolean }> {
  dataStore.saveIncidents(incidents);
  if (!isSupabaseActive()) return { persisted: false };
  const persisted = await supabaseStore.saveIncidents(incidents);
  return { persisted };
}

export async function setIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<Incident | undefined> {
  const local = dataStore.updateIncidentStatus(id, status);
  if (!isSupabaseActive()) return local;

  const remote = await supabaseStore.updateIncidentStatus(id, status);
  if (remote) return remote;
  return local;
}

export async function storeReport(report: InvestigationReport): Promise<{ persisted: boolean }> {
  dataStore.saveReport(report);
  if (!isSupabaseActive()) return { persisted: false };
  const persisted = await supabaseStore.saveReport(report);
  return { persisted };
}

export async function getReport(incidentId: string): Promise<InvestigationReport | undefined> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getReport(incidentId);
    if (remote !== undefined) return remote ?? undefined;
  }
  return dataStore.getReport(incidentId);
}

export async function listReports(): Promise<InvestigationReport[]> {
  if (isSupabaseActive()) {
    const remote = await supabaseStore.getAllReports();
    if (remote && remote.length > 0) return remote;
  }
  return dataStore.getAllReports();
}

export async function rehydrateFromDatabase(): Promise<boolean> {
  if (!isSupabaseActive()) return false;
  const incidents = await supabaseStore.getIncidents();
  if (!incidents || incidents.length === 0) return false;
  return true;
}

export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  if (!isSupabaseActive()) {
    return { connected: false, error: 'Supabase admin credentials are not configured' };
  }
  return supabaseStore.checkConnection();
}

