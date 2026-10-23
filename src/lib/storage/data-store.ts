import {
  NormalizedLogEvent,
  IngestSummary,
  Incident,
  InvestigationReport,
  IncidentStatus,
} from '@/types';
import { SecurityDetectionEngine } from '@/lib/security/detections/detection-engine';
import { EventCorrelationEngine } from '@/lib/security/correlation/correlation-engine';

// Singleton in-memory storage for local execution & demo fallback
class InMemoryDataStore {
  private uploads = new Map<string, IngestSummary>();
  private events = new Map<string, NormalizedLogEvent>();
  private incidents = new Map<string, Incident>();
  private reports = new Map<string, InvestigationReport>();

  constructor() {
    this.seedDemoData();
  }

  public getUploads(): IngestSummary[] {
    return Array.from(this.uploads.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public getUpload(uploadId: string): IngestSummary | undefined {
    return this.uploads.get(uploadId);
  }

  public saveUpload(summary: IngestSummary, newEvents: NormalizedLogEvent[]): void {
    this.uploads.set(summary.upload_id, summary);
    newEvents.forEach((ev) => this.events.set(ev.event_id, ev));
  }

  public deleteUpload(uploadId: string): boolean {
    const exists = this.uploads.has(uploadId);
    if (!exists) return false;
    this.uploads.delete(uploadId);

    // Delete associated events
    for (const [id, ev] of this.events.entries()) {
      if (ev.upload_id === uploadId) {
        this.events.delete(id);
      }
    }
    return true;
  }

  public getEvents(uploadId?: string): NormalizedLogEvent[] {
    const all = Array.from(this.events.values());
    if (uploadId) {
      return all.filter((e) => e.upload_id === uploadId);
    }
    return all.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public getEventsByIds(ids: string[]): NormalizedLogEvent[] {
    return ids
      .map((id) => this.events.get(id))
      .filter((e): e is NormalizedLogEvent => Boolean(e));
  }

  public getIncidents(): Incident[] {
    return Array.from(this.incidents.values()).sort((a, b) => b.risk_score - a.risk_score);
  }

  public getIncident(id: string): Incident | undefined {
    return this.incidents.get(id);
  }

  public saveIncidents(newIncidents: Incident[]): void {
    newIncidents.forEach((inc) => {
      this.incidents.set(inc.id, inc);
    });
  }

  public updateIncidentStatus(id: string, status: IncidentStatus): Incident | undefined {
    const inc = this.incidents.get(id);
    if (!inc) return undefined;
    inc.status = status;
    inc.updated_at = new Date().toISOString();
    this.incidents.set(id, inc);
    return inc;
  }

  public saveReport(report: InvestigationReport): void {
    this.reports.set(report.incident_id, report);
  }

  public getReport(incidentId: string): InvestigationReport | undefined {
    return this.reports.get(incidentId);
  }

  public getAllReports(): InvestigationReport[] {
    return Array.from(this.reports.values()).sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );
  }

  public getStats() {
    const allEvents = Array.from(this.events.values());
    const allIncidents = Array.from(this.incidents.values());

    const severityCounts = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    allIncidents.forEach((inc) => {
      if (severityCounts[inc.severity] !== undefined) {
        severityCounts[inc.severity]++;
      }
    });

    const avgRisk = allIncidents.length > 0
      ? Math.round(allIncidents.reduce((acc, i) => acc + i.risk_score, 0) / allIncidents.length)
      : 0;

    return {
      totalEvents: allEvents.length,
      totalIncidents: allIncidents.length,
      severityCounts,
      averageRiskScore: avgRisk,
      totalUploads: this.uploads.size,
    };
  }

  /**
   * Seeds deterministic realistic synthetic scenarios for hackathon evaluation and testing:
   * 1. Brute Force followed by Successful Login (analyst01 from 198.51.100.42)
   * 2. Password Spray across multiple accounts from single IP (203.0.113.88)
   * 3. Legitimate normal user sessions
   */
  public seedDemoData(): void {
    this.uploads.clear();
    this.events.clear();
    this.incidents.clear();
    this.reports.clear();

    const uploadId = 'upl_demo_master';
    const baseTime = new Date('2026-10-21T10:00:00.000Z').getTime();

    const syntheticEvents: NormalizedLogEvent[] = [
      // Normal activity
      {
        event_id: 'evt_norm_001',
        timestamp: new Date(baseTime).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'sarah.connor',
        source_ip: '10.0.4.15',
        host: 'auth-server-01',
        result: 'SUCCESS',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_norm_002',
        timestamp: new Date(baseTime + 120000).toISOString(),
        event_type: 'API_QUERY',
        username: 'sarah.connor',
        source_ip: '10.0.4.15',
        host: 'api-gateway',
        result: 'SUCCESS',
        upload_id: uploadId,
      },

      // Scenario 1: analyst01 Brute Force -> Success -> Suspicious Export
      {
        event_id: 'evt_sec_101',
        timestamp: new Date(baseTime + 300000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gateway-01',
        result: 'FAILURE',
        raw_payload: { reason: 'INVALID_CREDENTIALS', user_agent: 'Python-urllib/3.9' },
        upload_id: uploadId,
      },
      {
        event_id: 'evt_sec_102',
        timestamp: new Date(baseTime + 360000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gateway-01',
        result: 'FAILURE',
        raw_payload: { reason: 'INVALID_CREDENTIALS', user_agent: 'Python-urllib/3.9' },
        upload_id: uploadId,
      },
      {
        event_id: 'evt_sec_103',
        timestamp: new Date(baseTime + 420000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gateway-01',
        result: 'FAILURE',
        raw_payload: { reason: 'INVALID_CREDENTIALS', user_agent: 'Python-urllib/3.9' },
        upload_id: uploadId,
      },
      {
        event_id: 'evt_sec_104',
        timestamp: new Date(baseTime + 480000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gateway-01',
        result: 'FAILURE',
        raw_payload: { reason: 'INVALID_CREDENTIALS', user_agent: 'Python-urllib/3.9' },
        upload_id: uploadId,
      },
      {
        event_id: 'evt_sec_105',
        timestamp: new Date(baseTime + 540000).toISOString(),
        event_type: 'AUTH_LOGIN',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'vpn-gateway-01',
        result: 'SUCCESS',
        raw_payload: { auth_method: 'PASSWORD_ONLY', session_id: 'sess_9934af' },
        upload_id: uploadId,
      },
      {
        event_id: 'evt_sec_106',
        timestamp: new Date(baseTime + 720000).toISOString(),
        event_type: 'DATA_EXPORT_CUSTOMER_RECORDS',
        username: 'analyst01',
        source_ip: '198.51.100.42',
        host: 'db-customer-prod-02',
        result: 'SUCCESS',
        raw_payload: { records_exported: 45000, table: 'customers' },
        upload_id: uploadId,
      },

      // Scenario 2: Password Spray from single origin 203.0.113.88
      {
        event_id: 'evt_spray_201',
        timestamp: new Date(baseTime + 900000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'dev_ops_admin',
        source_ip: '203.0.113.88',
        host: 'sso-portal',
        result: 'FAILURE',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_spray_202',
        timestamp: new Date(baseTime + 960000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'finance_manager',
        source_ip: '203.0.113.88',
        host: 'sso-portal',
        result: 'FAILURE',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_spray_203',
        timestamp: new Date(baseTime + 1020000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'hr_lead',
        source_ip: '203.0.113.88',
        host: 'sso-portal',
        result: 'FAILURE',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_spray_204',
        timestamp: new Date(baseTime + 1080000).toISOString(),
        event_type: 'USER_LOGIN',
        username: 'security_lead',
        source_ip: '203.0.113.88',
        host: 'sso-portal',
        result: 'FAILURE',
        upload_id: uploadId,
      },

      // Scenario 3: Repeated Access Denied for unauthorized user
      {
        event_id: 'evt_deny_301',
        timestamp: new Date(baseTime + 1200000).toISOString(),
        event_type: 'ADMIN_PANEL_ACCESS',
        username: 'contractor_jim',
        source_ip: '10.0.12.99',
        host: 'admin-internal',
        result: 'DENIED',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_deny_302',
        timestamp: new Date(baseTime + 1260000).toISOString(),
        event_type: 'CONFIG_MUTATION',
        username: 'contractor_jim',
        source_ip: '10.0.12.99',
        host: 'admin-internal',
        result: 'DENIED',
        upload_id: uploadId,
      },
      {
        event_id: 'evt_deny_303',
        timestamp: new Date(baseTime + 1320000).toISOString(),
        event_type: 'KEY_VAULT_READ',
        username: 'contractor_jim',
        source_ip: '10.0.12.99',
        host: 'admin-internal',
        result: 'DENIED',
        upload_id: uploadId,
      },
    ];

    syntheticEvents.forEach((ev) => this.events.set(ev.event_id, ev));

    const summary: IngestSummary = {
      upload_id: uploadId,
      filename: 'synthetic_enterprise_soc_sample.json',
      data_source: 'SYNTHETIC_DEMO',
      total_rows: syntheticEvents.length,
      accepted_rows: syntheticEvents.length,
      rejected_rows: 0,
      errors: [],
      created_at: new Date(baseTime).toISOString(),
    };
    this.uploads.set(uploadId, summary);

    // Run detections and correlation on the seeded events
    const detector = new SecurityDetectionEngine();
    const detections = detector.runDetections(syntheticEvents);

    const correlator = new EventCorrelationEngine();
    const incidents = correlator.correlate(syntheticEvents, detections, 'ws_demo');
    this.saveIncidents(incidents);
  }
}

// Global singleton instance preserved across requests in server runtime.
//
// In production the `NODE_ENV !== 'production'` guard used to skip registering the
// singleton on globalThis, so every route module got its own private store. That made
// /api/v1/uploads and /api/v1/incidents (which share a bundle) see uploaded data while
// /api/v1/stats (a separate bundle) kept reporting the seed-only baseline. Always
// register on globalThis so all route bundles resolve the same instance.
const globalForDataStore = globalThis as unknown as {
  __dataStore?: InMemoryDataStore;
};

export const dataStore = globalForDataStore.__dataStore ?? new InMemoryDataStore();

globalForDataStore.__dataStore = dataStore;
