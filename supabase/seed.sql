-- Root & Reason — Seed Data
-- Deterministic synthetic scenario data for demonstration and validation

INSERT INTO workspaces (id, name)
VALUES ('ws_demo', 'Global SOC Operations')
ON CONFLICT (id) DO NOTHING;

INSERT INTO detection_rules (id, workspace_id, name, description, enabled, base_severity, base_score, mitre_attack_id)
VALUES
  ('RULE_BRUTE_FORCE_USER', 'ws_demo', 'Repeated Failed Logins (Brute Force Attempt)', 'Multiple failed authentication events targeting a single user account.', true, 'HIGH', 35, 'T1110.001'),
  ('RULE_PASSWORD_SPRAY_IP', 'ws_demo', 'Distributed Password Spraying Pattern', 'Single source IP attempting failed logins across multiple user accounts.', true, 'HIGH', 40, 'T1110.003'),
  ('RULE_SUCCESS_AFTER_FAILURES', 'ws_demo', 'Successful Authentication Following Multiple Failures', 'Account compromise alert: successful login preceded by repeated credential failures.', true, 'CRITICAL', 55, 'T1078'),
  ('RULE_REPEATED_ACCESS_DENIED', 'ws_demo', 'Repeated Authorization / Access Denied Events', 'Multiple access-denied or permission-blocked events.', true, 'MEDIUM', 25, 'T1068'),
  ('RULE_SUSPICIOUS_POST_COMPROMISE', 'ws_demo', 'High-Impact Action After Authentication Anomaly', 'Critical resource access or data export following authentication failures.', true, 'CRITICAL', 50, 'T1020')
ON CONFLICT (id) DO NOTHING;
