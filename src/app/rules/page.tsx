import React from 'react';
import { Sliders, Shield, Info, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';
import { DEFAULT_DETECTION_POLICY } from '@/lib/security/detections/detection-engine';

export default function RulesPage() {
  const rules = [
    {
      id: 'RULE_BRUTE_FORCE_USER',
      name: 'Repeated Failed Logins (Brute Force Attempt)',
      severity: 'HIGH',
      score: 35,
      mitre: 'T1110.001 (Password Guessing)',
      description:
        'Triggers when a single user account or IP origin experiences multiple consecutive failed authentication events within a configured sliding time window.',
      conditions: `≥ ${DEFAULT_DETECTION_POLICY.failedLoginThresholdUser} failures within ${
        DEFAULT_DETECTION_POLICY.failedLoginThresholdWindowMs / 60000
      } minutes`,
      limitations:
        'Can trigger on legitimate users mistyping passwords, an expired cached token in a local client, or an unupdated service account.',
    },
    {
      id: 'RULE_PASSWORD_SPRAY_IP',
      name: 'Distributed Password Spraying Pattern',
      severity: 'HIGH',
      score: 40,
      mitre: 'T1110.003 (Password Spraying)',
      description:
        'Identifies a single source IP attempting failed logins across multiple distinct corporate accounts, evading per-account lockout policies.',
      conditions: `≥ ${DEFAULT_DETECTION_POLICY.passwordSprayUserThreshold} distinct usernames targeted from 1 IP within ${
        DEFAULT_DETECTION_POLICY.failedLoginThresholdWindowMs / 60000
      } minutes`,
      limitations:
        'May trigger when multiple employees connect via a single shared corporate VPN or office NAT gateway after an organization-wide password rotation.',
    },
    {
      id: 'RULE_SUCCESS_AFTER_FAILURES',
      name: 'Successful Authentication Following Multiple Failures',
      severity: 'CRITICAL',
      score: 55,
      mitre: 'T1078 (Valid Accounts / Account Takeover)',
      description:
        'Signals potential account takeover: an account achieves a successful login immediately following a sequence of failed authentication attempts.',
      conditions: `≥ ${DEFAULT_DETECTION_POLICY.successAfterFailureThreshold} failures followed by SUCCESS within ${
        DEFAULT_DETECTION_POLICY.successAfterFailureWindowMs / 60000
      } minutes`,
      limitations:
        'A user who forgot their password may have succeeded on the 4th attempt or recovered their credentials from a manager.',
    },
    {
      id: 'RULE_REPEATED_ACCESS_DENIED',
      name: 'Repeated Authorization / Access Denied Events',
      severity: 'MEDIUM',
      score: 25,
      mitre: 'T1068 (Exploitation for Privilege Escalation)',
      description:
        'Detects multiple access-denied or authorization-blocked events in succession, indicating an active permission probe or unauthorized access attempt.',
      conditions: `≥ ${DEFAULT_DETECTION_POLICY.accessDeniedThreshold} DENIED events within ${
        DEFAULT_DETECTION_POLICY.accessDeniedWindowMs / 60000
      } minutes`,
      limitations:
        'Can occur when a developer or contractor with newly revoked permissions attempts to execute an existing automated script.',
    },
    {
      id: 'RULE_SUSPICIOUS_POST_COMPROMISE',
      name: 'High-Impact Action After Authentication Anomaly',
      severity: 'CRITICAL',
      score: 50,
      mitre: 'T1020 (Automated Exfiltration / Lateral Movement)',
      description:
        'Detects sensitive operations (DATA_EXPORT, ADMIN_ROLE_ADD, KEY_ACCESS) executed shortly after authentication failures or credential anomalies.',
      conditions: `High-privilege event within ${
        DEFAULT_DETECTION_POLICY.postCompromiseWindowMs / 60000
      } minutes following ≥ 2 prior login failures`,
      limitations:
        'Legitimate system administrator who made authentication typos before performing scheduled operational tasks.',
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="border-b border-[#1a2a47] pb-5">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Sliders className="w-6 h-6 text-cyan-400" />
          <span>Deterministic Detection Rules</span>
        </h1>
        <p className="text-sm text-slate-400">
          Inspection of deterministic security rules executed against ingested logs. All rules are deterministic, explainable, and mapped to the MITRE ATT&CK framework.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="p-5 rounded-xl bg-[#0d1527] border border-[#1a2a47] space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono text-xs font-bold text-cyan-400">{rule.id}</span>
                <span className="text-white font-bold text-sm">{rule.name}</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    rule.severity === 'CRITICAL'
                      ? 'bg-red-950 text-red-400 border-red-800'
                      : rule.severity === 'HIGH'
                      ? 'bg-orange-950 text-orange-400 border-orange-800'
                      : 'bg-amber-950 text-amber-400 border-amber-800'
                  }`}
                >
                  {rule.severity}
                </span>
              </div>

              <div className="text-xs font-mono text-cyan-400 font-semibold">
                +{rule.score} Risk Contribution
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{rule.description}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="text-slate-400 text-[10px] uppercase font-semibold mb-1">
                  Threshold Conditions
                </div>
                <div className="text-slate-200 font-mono text-[11px]">{rule.conditions}</div>
              </div>

              <div className="p-3 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="text-slate-400 text-[10px] uppercase font-semibold mb-1">
                  MITRE ATT&CK Technique
                </div>
                <div className="text-cyan-400 font-mono text-[11px]">{rule.mitre}</div>
              </div>

              <div className="p-3 rounded-lg bg-[#080c14] border border-[#1a2a47]">
                <div className="text-slate-400 text-[10px] uppercase font-semibold mb-1 flex items-center gap-1">
                  <Info className="w-3 h-3 text-amber-400" />
                  <span>False Positive Considerations</span>
                </div>
                <div className="text-slate-400 text-[11px] leading-tight">{rule.limitations}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
