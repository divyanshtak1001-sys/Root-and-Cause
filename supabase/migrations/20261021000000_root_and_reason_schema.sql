-- Root & Reason — Supabase Database Architecture
-- Comprehensive schema with RLS, indexes, and deterministic relationships

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'SOC Analyst',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. WORKSPACES
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. WORKSPACE MEMBERS
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (workspace_id, user_id)
);

-- 4. LOG UPLOADS
CREATE TABLE IF NOT EXISTS log_uploads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  total_rows INT NOT NULL DEFAULT 0,
  accepted_rows INT NOT NULL DEFAULT 0,
  rejected_rows INT NOT NULL DEFAULT 0,
  error_summary JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. LOG EVENTS
CREATE TABLE IF NOT EXISTS log_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  upload_id TEXT REFERENCES log_uploads(id) ON DELETE CASCADE,
  source_event_id TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  event_type TEXT NOT NULL,
  username TEXT NOT NULL,
  source_ip TEXT NOT NULL,
  host TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('SUCCESS', 'FAILURE', 'DENIED', 'UNKNOWN')),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. DETECTION RULES
CREATE TABLE IF NOT EXISTS detection_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  base_severity TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (base_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  base_score INT NOT NULL DEFAULT 30,
  mitre_attack_id TEXT,
  rule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. INCIDENTS
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  risk_score INT NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  confidence INT NOT NULL DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'TRIAGED', 'INVESTIGATING', 'CONTAINED', 'CLOSED')),
  summary TEXT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  primary_user TEXT,
  primary_ip TEXT,
  primary_host TEXT,
  event_count INT NOT NULL DEFAULT 0,
  detections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. INCIDENT EVENTS
CREATE TABLE IF NOT EXISTS incident_events (
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES log_events(id) ON DELETE CASCADE,
  rule_id TEXT REFERENCES detection_rules(id) ON DELETE SET NULL,
  contribution_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (incident_id, event_id)
);

-- 9. INVESTIGATION REPORTS
CREATE TABLE IF NOT EXISTS investigation_reports (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  model TEXT NOT NULL,
  generation_method TEXT NOT NULL CHECK (generation_method IN ('gemini_ai', 'deterministic_fallback')),
  report_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_log_events_workspace_timestamp ON log_events(workspace_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_events_upload ON log_events(upload_id);
CREATE INDEX IF NOT EXISTS idx_log_events_user ON log_events(username);
CREATE INDEX IF NOT EXISTS idx_log_events_ip ON log_events(source_ip);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace_severity ON incidents(workspace_id, severity);
CREATE INDEX IF NOT EXISTS idx_incidents_workspace_status ON incidents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_updated_at ON incidents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_investigation_reports_incident ON investigation_reports(incident_id);

-- ROW LEVEL SECURITY (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE detection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE investigation_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Workspace Member Policies (non-recursive)
CREATE POLICY "Users can access workspaces they belong to"
  ON workspaces FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_members.workspace_id = workspaces.id AND workspace_members.user_id = auth.uid()
  ));

CREATE POLICY "Workspace members can read uploads"
  ON log_uploads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_members.workspace_id = log_uploads.workspace_id AND workspace_members.user_id = auth.uid()
  ));

CREATE POLICY "Workspace members can insert uploads"
  ON log_uploads FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_members.workspace_id = log_uploads.workspace_id AND workspace_members.user_id = auth.uid()
  ));

CREATE POLICY "Workspace members can read incidents"
  ON incidents FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM workspace_members WHERE workspace_members.workspace_id = incidents.workspace_id AND workspace_members.user_id = auth.uid()
  ));
