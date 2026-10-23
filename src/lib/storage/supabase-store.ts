import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NormalizedLogEvent,
  IngestSummary,
  Incident,
  InvestigationReport,
  IncidentStatus,
  LogResult,
  Severity,
} from '@/types';
import { createAdminSupabaseClient, isSupabaseAdminConfigured } from '@/lib/supabase/server';

/**
 * Supabase-backed store.
 *
 * Mirrors the in-memory store's interface exactly so routes can swap between them.
 * Writes are best-effort: if Supabase is unreachable or rejects a write the caller
 * keeps its in-memory copy, so a cloud outage degrades persistence rather than
 * breaking ingestion.
 *
 * The service-role client is required because every table has RLS enabled and there
 * is no end-user auth session in this demo.
 */

const WORKSPACE_ID = 'ws_demo';

type Row = Record<string, unknown>;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!isSupabaseAdminConfigured()) return null;
  if (!client) client = createAdminSupabaseClient();
  return client;
}

function logError(op: string, error: unknown): void {
  console.warn(`[supabase-store] ${op} failed:`, error instanceof Error ? error.message : error);
}

/** PostgREST `.in()` with a large id list overflows the URL; chunk it. */
function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── Row mappers (DB snake_case <-> domain types) ────────────────────────────

function toUploadSummary(row: Row): IngestSummary {
  const filename = String(row.filename ?? '');
  return {
    upload_id: String(row.id),
    filename,
    total_rows: Number(row.total_rows ?? 0),
    accepted_rows: Number(row.accepted_rows ?? 0),
    rejected_rows: Number(row.rejected_rows ?? 0),
    errors: Array.isArray(row.error_summary) ? (row.error_summary as IngestSummary['errors']) : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
    // The schema has no provenance column and this task must not change the database, so
    // it is derived: the seeded demo batch is the only one written with the demo id.
    data_source:
      String(row.id) === 'upl_demo_master' ? 'SYNTHETIC_DEMO' : 'UPLOADED_FILE',
  };
}

function toEvent(row: Row): NormalizedLogEvent {
  return {
    event_id: String(row.id),
    source_event_id: (row.source_event_id as string) ?? undefined,
    timestamp: String(row.timestamp),
    event_type: String(row.event_type),
    username: String(row.username),
    source_ip: String(row.source_ip),
    host: String(row.host),
    result: (row.result as LogResult) ?? 'UNKNOWN',
    raw_payload: (row.raw_payload as Record<string, unknown>) ?? undefined,
    upload_id: (row.upload_id as string) ?? undefined,
    workspace_id: (row.workspace_id as string) ?? undefined,
  };
}

function toIncident(row: Row, eventIds: string[] = []): Incident {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id ?? WORKSPACE_ID),
    title: String(row.title ?? ''),
    severity: (row.severity as Severity) ?? 'MEDIUM',
    risk_score: Number(row.risk_score ?? 0),
    confidence: Number(row.confidence ?? 0),
    status: (row.status as IncidentStatus) ?? 'NEW',
    summary: String(row.summary ?? ''),
    first_seen: String(row.first_seen),
    last_seen: String(row.last_seen),
    primary_user: (row.primary_user as string) ?? undefined,
    primary_ip: (row.primary_ip as string) ?? undefined,
    primary_host: (row.primary_host as string) ?? undefined,
    event_count: Number(row.event_count ?? eventIds.length),
    event_ids: eventIds,
    detections: Array.isArray(row.detections) ? (row.detections as Incident['detections']) : [],
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function toReport(row: Row): InvestigationReport {
  return row.report_json as InvestigationReport;
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function getUploads(): Promise<IngestSummary[] | null> {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db
    .from('log_uploads')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('created_at', { ascending: false });
  if (error) {
    logError('getUploads', error);
    return null;
  }
  return (data ?? []).map(toUploadSummary);
}

export async function getUpload(uploadId: string): Promise<IngestSummary | null | undefined> {
  const db = getClient();
  if (!db) return undefined;
  const { data, error } = await db.from('log_uploads').select('*').eq('id', uploadId).maybeSingle();
  if (error) {
    logError('getUpload', error);
    return undefined;
  }
  return data ? toUploadSummary(data as Row) : null;
}

export async function getEvents(uploadId?: string): Promise<NormalizedLogEvent[] | null> {
  const db = getClient();
  if (!db) return null;
  let query = db
    .from('log_events')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('timestamp', { ascending: true });
  if (uploadId) query = query.eq('upload_id', uploadId);
  const { data, error } = await query;
  if (error) {
    logError('getEvents', error);
    return null;
  }
  return (data ?? []).map(toEvent);
}

export async function getEventsByIds(ids: string[]): Promise<NormalizedLogEvent[] | null> {
  const db = getClient();
  if (!db) return null;
  if (ids.length === 0) return [];
  const results: NormalizedLogEvent[] = [];
  for (const group of chunk(ids)) {
    const { data, error } = await db.from('log_events').select('*').in('id', group);
    if (error) {
      logError('getEventsByIds', error);
      return null;
    }
    results.push(...(data ?? []).map(toEvent));
  }
  // Preserve the caller's ordering so evidence lists stay deterministic.
  const byId = new Map(results.map((e) => [e.event_id, e]));
  return ids.map((id) => byId.get(id)).filter((e): e is NormalizedLogEvent => Boolean(e));
}

async function getIncidentEventIds(incidentIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const db = getClient();
  if (!db || incidentIds.length === 0) return map;
  for (const group of chunk(incidentIds)) {
    const { data, error } = await db
      .from('incident_events')
      .select('incident_id, event_id')
      .in('incident_id', group);
    if (error) {
      logError('getIncidentEventIds', error);
      continue;
    }
    for (const row of (data ?? []) as Row[]) {
      const key = String(row.incident_id);
      map.set(key, [...(map.get(key) ?? []), String(row.event_id)]);
    }
  }
  return map;
}

export async function getIncidents(): Promise<Incident[] | null> {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db
    .from('incidents')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('risk_score', { ascending: false });
  if (error) {
    logError('getIncidents', error);
    return null;
  }
  const rows = (data ?? []) as Row[];
  const links = await getIncidentEventIds(rows.map((r) => String(r.id)));
  return rows.map((r) => toIncident(r, links.get(String(r.id)) ?? []));
}

export async function getIncident(id: string): Promise<Incident | null | undefined> {
  const db = getClient();
  if (!db) return undefined;
  const { data, error } = await db.from('incidents').select('*').eq('id', id).maybeSingle();
  if (error) {
    logError('getIncident', error);
    return undefined;
  }
  if (!data) return null;
  const links = await getIncidentEventIds([id]);
  return toIncident(data as Row, links.get(id) ?? []);
}

export async function getReport(incidentId: string): Promise<InvestigationReport | null | undefined> {
  const db = getClient();
  if (!db) return undefined;
  const { data, error } = await db
    .from('investigation_reports')
    .select('*')
    .eq('incident_id', incidentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError('getReport', error);
    return undefined;
  }
  return data ? toReport(data as Row) : null;
}

export async function getAllReports(): Promise<InvestigationReport[] | null> {
  const db = getClient();
  if (!db) return null;
  const { data, error } = await db
    .from('investigation_reports')
    .select('*')
    .eq('workspace_id', WORKSPACE_ID)
    .order('created_at', { ascending: false });
  if (error) {
    logError('getAllReports', error);
    return null;
  }
  return (data ?? []).map((r) => toReport(r as Row));
}

// ── Writes ─────────────────────────────────────────────────────────────────

export async function saveUpload(summary: IngestSummary, events: NormalizedLogEvent[]): Promise<boolean> {
  const db = getClient();
  if (!db) return false;

  const { error: uploadError } = await db.from('log_uploads').upsert(
    {
      id: summary.upload_id,
      workspace_id: WORKSPACE_ID,
      filename: summary.filename,
      status: 'COMPLETED',
      total_rows: summary.total_rows,
      accepted_rows: summary.accepted_rows,
      rejected_rows: summary.rejected_rows,
      error_summary: summary.errors,
      created_at: summary.created_at,
    },
    { onConflict: 'id' }
  );
  if (uploadError) {
    logError('saveUpload(upload)', uploadError);
    return false;
  }

  for (const group of chunk(events)) {
    const { error } = await db.from('log_events').upsert(
      group.map((e) => ({
        id: e.event_id,
        workspace_id: WORKSPACE_ID,
        upload_id: summary.upload_id,
        source_event_id: e.source_event_id ?? null,
        timestamp: e.timestamp,
        event_type: e.event_type,
        username: e.username,
        source_ip: e.source_ip,
        host: e.host,
        result: e.result,
        raw_payload: e.raw_payload ?? null,
      })),
      { onConflict: 'id' }
    );
    if (error) {
      logError('saveUpload(events)', error);
      return false;
    }
  }
  return true;
}

export async function deleteUpload(uploadId: string): Promise<boolean> {
  const db = getClient();
  if (!db) return false;
  const { error } = await db.from('log_uploads').delete().eq('id', uploadId);
  if (error) {
    logError('deleteUpload', error);
    return false;
  }
  return true;
}

export async function saveIncidents(incidents: Incident[]): Promise<boolean> {
  const db = getClient();
  if (!db || incidents.length === 0) return false;

  for (const group of chunk(incidents, 50)) {
    // Guarantee the FK target exists before linking rows.
    await db.from('workspaces').upsert(
      { id: WORKSPACE_ID, name: 'Global SOC Operations' },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    const { error } = await db.from('incidents').upsert(
      group.map((i) => ({
        id: i.id,
        workspace_id: WORKSPACE_ID,
        title: i.title,
        severity: i.severity,
        risk_score: i.risk_score,
        confidence: i.confidence,
        status: i.status,
        summary: i.summary,
        first_seen: i.first_seen,
        last_seen: i.last_seen,
        primary_user: i.primary_user ?? null,
        primary_ip: i.primary_ip ?? null,
        primary_host: i.primary_host ?? null,
        event_count: i.event_count,
        detections: i.detections,
        created_at: i.created_at,
        updated_at: i.updated_at,
      })),
      { onConflict: 'id' }
    );
    if (error) {
      logError('saveIncidents', error);
      return false;
    }

    const links = group.flatMap((i) =>
      i.event_ids.map((eventId) => ({
        incident_id: i.id,
        event_id: eventId,
        rule_id: null,
        contribution_reason: null,
      }))
    );
    for (const linkGroup of chunk(links, 100)) {
      // Composite PK (incident_id, event_id). A plain insert with the caller-supplied
      // ordering is the shape that PostgREST reliably accepts here; duplicate links
      // (23505) are expected when re-saving an unchanged incident.
      const { error: linkError } = await db.from('incident_events').insert(linkGroup);
      if (linkError && linkError.code === '23505') {
        for (const link of linkGroup) {
          const { error: rowError } = await db.from('incident_events').insert(link);
          if (rowError && rowError.code !== '23505') {
            logError('saveIncidents(link)', rowError);
          }
        }
      } else if (linkError) {
        logError('saveIncidents(links)', linkError);
      }
    }
  }
  return true;
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<Incident | null | undefined> {
  const db = getClient();
  if (!db) return undefined;
  const updatedAt = new Date().toISOString();
  const { data, error } = await db
    .from('incidents')
    .update({ status, updated_at: updatedAt })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    logError('updateIncidentStatus', error);
    return undefined;
  }
  if (!data) return null;
  const links = await getIncidentEventIds([id]);
  return toIncident(data as Row, links.get(id) ?? []);
}

export async function saveReport(report: InvestigationReport): Promise<boolean> {
  const db = getClient();
  if (!db) return false;
  const { error } = await db.from('investigation_reports').upsert(
    {
      id: report.id,
      workspace_id: WORKSPACE_ID,
      incident_id: report.incident_id,
      model: report.model,
      generation_method: report.generation_method,
      report_json: report,
      created_at: report.generated_at,
    },
    { onConflict: 'id' }
  );
  if (error) {
    logError('saveReport', error);
    return false;
  }
  return true;
}

/** Clears workspace data so a reseed starts from a known state. */
export async function clearWorkspaceData(): Promise<boolean> {
  const db = getClient();
  if (!db) return false;

  // incident_events has no workspace_id column; resolve its rows via incidents.
  const { data: incidentRows } = await db
    .from('incidents')
    .select('id')
    .eq('workspace_id', WORKSPACE_ID);
  const incidentIds = ((incidentRows ?? []) as Row[]).map((r) => String(r.id));
  for (const group of chunk(incidentIds)) {
    const { error } = await db.from('incident_events').delete().in('incident_id', group);
    if (error) logError('clearWorkspaceData(incident_events)', error);
  }

  // Order matters: children before parents to respect foreign keys.
  for (const table of ['investigation_reports', 'incidents', 'log_events', 'log_uploads']) {
    const { error } = await db.from(table).delete().eq('workspace_id', WORKSPACE_ID);
    if (error && error.code !== 'PGRST116') logError(`clearWorkspaceData(${table})`, error);
  }
  return true;
}

/** True when a service-role client is available (used for /api/v1/health). */
export function isPersistenceEnabled(): boolean {
  return isSupabaseAdminConfigured();
}

/** Round-trips a trivial query to prove the database is reachable right now. */
export async function checkConnection(): Promise<{ connected: boolean; error?: string }> {
  const db = getClient();
  if (!db) return { connected: false, error: 'Supabase admin credentials are not configured' };
  const { error } = await db.from('workspaces').select('id').limit(1);
  if (error) return { connected: false, error: error.message };
  return { connected: true };
}
