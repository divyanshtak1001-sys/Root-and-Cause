export type LogResult = 'SUCCESS' | 'FAILURE' | 'DENIED' | 'UNKNOWN';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IncidentStatus = 'NEW' | 'TRIAGED' | 'INVESTIGATING' | 'CONTAINED' | 'CLOSED';

export interface NormalizedLogEvent {
  event_id: string;
  source_event_id?: string;
  timestamp: string; // ISO 8601 UTC string
  event_type: string;
  username: string;
  source_ip: string;
  host: string;
  result: LogResult;
  raw_payload?: Record<string, unknown> | string;
  upload_id?: string;
  workspace_id?: string;
}

export interface IngestRowError {
  row: number;
  reason: string;
  raw?: string;
}

/**
 * Where a dataset came from. Recorded so seeded demo data can never be mistaken for a
 * real security event, and so uploaded data is traceable to its file.
 *
 * TEST_FIXTURE and CONNECTED_SOURCE are declared for completeness; nothing in the app
 * produces them today (there is no external connector), so they are never emitted.
 */
export type DataSource =
  | 'UPLOADED_FILE'
  | 'SYNTHETIC_DEMO'
  | 'TEST_FIXTURE'
  | 'CONNECTED_SOURCE';

export interface IngestSummary {
  upload_id: string;
  filename: string;
  total_rows: number;
  accepted_rows: number;
  rejected_rows: number;
  errors: IngestRowError[];
  created_at: string;
  /** Provenance of this dataset. Absent only on rows written before this field existed. */
  data_source?: DataSource;
}

export interface DetectionRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  base_severity: Severity;
  base_score: number;
  mitre_attack_id?: string;
  mitre_technique?: string;
  rule_config: Record<string, unknown>;
}

export interface DetectionResult {
  rule_id: string;
  rule_name: string;
  description: string;
  relevant_event_ids: string[];
  detection_timestamp: string;
  matched_conditions: Record<string, unknown>;
  suggested_severity: Severity;
  contributing_score: number;
  explanation: string;
  limitations_or_false_positives: string;
  mitre_attack_id?: string;
}

export interface Incident {
  id: string;
  workspace_id: string;
  title: string;
  severity: Severity;
  risk_score: number;
  confidence: number;
  status: IncidentStatus;
  summary: string;
  first_seen: string;
  last_seen: string;
  primary_user?: string;
  primary_ip?: string;
  primary_host?: string;
  event_count: number;
  event_ids: string[];
  detections: DetectionResult[];
  created_at: string;
  updated_at: string;
}

export interface InvestigationReport {
  id: string;
  incident_id: string;
  workspace_id: string;
  title: string;
  executive_summary: string;
  severity: Severity;
  risk_score: number;
  confidence_score: number;
  observations: string[];
  evidence_references: string[];
  event_timeline: Array<{
    event_id: string;
    timestamp: string;
    summary: string;
    significance: string;
  }>;
  likely_explanations: string[];
  uncertainty: string[];
  recommended_verification_steps: string[];
  relevant_attack_techniques: string[];
  generation_method: 'gemini_ai' | 'deterministic_fallback';
  model: string;
  generated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  facts?: string[];
  hypotheses?: string[];
  recommendations?: string[];
  evidence_ids?: string[];
  suggested_actions?: string[];
}
