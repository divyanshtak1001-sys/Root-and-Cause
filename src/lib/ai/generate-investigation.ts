import { Incident, NormalizedLogEvent, InvestigationReport, ChatMessage } from '@/types';
import { createGeminiClient, getGeminiModelName, isGeminiConfigured } from './gemini-client';
import {
  INVESTIGATION_SYSTEM_PROMPT,
  buildInvestigationReportPrompt,
  buildChatInvestigationPrompt,
  REPORT_RESPONSE_SCHEMA,
  CHAT_RESPONSE_SCHEMA,
} from './investigation-prompts';
import {
  InvestigationReportZodSchema,
  ChatInvestigationZodSchema,
  ChatInvestigationSchemaType,
} from './report-schema';
import { EvidenceManager } from '@/lib/security/evidence/evidence-manager';
import { metricsStore } from '@/lib/monitoring/metrics';

export interface GenerateReportResult {
  report: InvestigationReport;
  usedFallback: boolean;
  fallbackReason?: string;
}

/**
 * Real Gemini responses routinely take 20-45s on congested free-tier models, so a
 * fixed 20s deadline made every live call abort and silently fall back. Tunable via
 * GEMINI_TIMEOUT_MS.
 */
function getGeminiTimeoutMs(defaultMs: number): number {
  const raw = process.env.GEMINI_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

export async function generateInvestigationReport(
  incident: Incident,
  allEvents: NormalizedLogEvent[]
): Promise<GenerateReportResult> {
  const startedAt = Date.now();
  const verifiedEvents = allEvents.filter((e) => incident.event_ids.includes(e.event_id));

  // If Gemini is not configured, immediately use deterministic fallback
  if (!isGeminiConfigured()) {
    const report = EvidenceManager.generateFallbackReport(incident, verifiedEvents);
    metricsStore.recordAiFallback(Date.now() - startedAt, 'GEMINI_API_KEY is not configured');
    return {
      report,
      usedFallback: true,
      fallbackReason: 'GEMINI_API_KEY is not configured in environment variables.',
    };
  }

  const ai = createGeminiClient();
  if (!ai) {
    const report = EvidenceManager.generateFallbackReport(incident, verifiedEvents);
    metricsStore.recordAiFallback(Date.now() - startedAt, 'Failed to initialize Gemini client');
    return {
      report,
      usedFallback: true,
      fallbackReason: 'Failed to initialize Gemini AI client.',
    };
  }

  try {
    const modelName = getGeminiModelName();
    const prompt = buildInvestigationReportPrompt(
      JSON.stringify(
        {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          risk_score: incident.risk_score,
          summary: incident.summary,
          primary_user: incident.primary_user,
          primary_ip: incident.primary_ip,
          primary_host: incident.primary_host,
          first_seen: incident.first_seen,
          last_seen: incident.last_seen,
        },
        null,
        2
      ),
      JSON.stringify(
        verifiedEvents.map((e) => ({
          event_id: e.event_id,
          timestamp: e.timestamp,
          event_type: e.event_type,
          username: e.username,
          source_ip: e.source_ip,
          host: e.host,
          result: e.result,
        })),
        null,
        2
      ),
      JSON.stringify(incident.detections, null, 2)
    );

    // Bounded request with timeout
    const reportTimeoutMs = getGeminiTimeoutMs(60000);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Gemini API call timed out after ${Math.round(reportTimeoutMs / 1000)} seconds`)),
        reportTimeoutMs
      )
    );

    const apiPromise = ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: INVESTIGATION_SYSTEM_PROMPT },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: REPORT_RESPONSE_SCHEMA,
      },
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const rawText = response.text || '';
    if (!rawText.trim()) {
      throw new Error('Gemini returned an empty response.');
    }

    const parsedJson = JSON.parse(rawText);
    const validated = InvestigationReportZodSchema.safeParse(parsedJson);

    if (!validated.success) {
      throw new Error(`Report output failed Zod schema validation: ${validated.error.message}`);
    }

    // Verify all cited event IDs
    const refCheck = EvidenceManager.verifyEvidenceReferences(incident, validated.data.evidence_references);
    if (!refCheck.isValid) {
      throw new Error(
        `AI cited ${refCheck.invalidIds.length} non-existent event IDs: ${refCheck.invalidIds.join(', ')}`
      );
    }

    const report: InvestigationReport = {
      id: `rep_${incident.id}`,
      incident_id: incident.id,
      workspace_id: incident.workspace_id,
      title: validated.data.title,
      executive_summary: validated.data.executive_summary,
      severity: incident.severity, // maintain deterministic severity
      risk_score: incident.risk_score, // maintain deterministic score
      confidence_score: incident.confidence,
      observations: validated.data.observations,
      evidence_references: refCheck.validIds,
      event_timeline: validated.data.event_timeline.filter((item) =>
        incident.event_ids.includes(item.event_id)
      ),
      likely_explanations: validated.data.likely_explanations,
      uncertainty: validated.data.uncertainty,
      recommended_verification_steps: validated.data.recommended_verification_steps,
      relevant_attack_techniques: validated.data.relevant_attack_techniques,
      generation_method: 'gemini_ai',
      model: modelName,
      generated_at: new Date().toISOString(),
    };

    metricsStore.recordAiSuccess(Date.now() - startedAt, 'gemini');
    return {
      report,
      usedFallback: false,
    };
  } catch (err: unknown) {    const errorMsg = (err as Error).message || String(err);
    console.warn('Gemini report generation failed; falling back to deterministic report:', errorMsg);
    metricsStore.recordAiFailure(err);
    metricsStore.recordAiFailure(err);
    const fallbackReport = EvidenceManager.generateFallbackReport(incident, verifiedEvents);
    fallbackReport.uncertainty.push(`AI Generation Error: ${errorMsg}`);
    return {
      report: fallbackReport,
      usedFallback: true,
      fallbackReason: errorMsg,
    };
  }
}

import { adbtService } from '@/lib/adbt/adbt-service';

export async function chatInvestigation(
  question: string,
  incident: Incident,
  allEvents: NormalizedLogEvent[],
  history: ChatMessage[] = []
): Promise<ChatInvestigationSchemaType> {
  const verifiedEvents = allEvents.filter((e) => incident.event_ids.includes(e.event_id));

  // If Gemini is unconfigured or unavailable, use deterministic conversational response
  if (!isGeminiConfigured()) {
    return generateDeterministicChatResponse(question, incident, verifiedEvents);
  }

  const ai = createGeminiClient();
  if (!ai) {
    return generateDeterministicChatResponse(question, incident, verifiedEvents);
  }

  try {
    const modelName = getGeminiModelName();
    const prompt = buildChatInvestigationPrompt(
      question,
      JSON.stringify(
        {
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          risk_score: incident.risk_score,
          summary: incident.summary,
          primary_user: incident.primary_user,
          primary_ip: incident.primary_ip,
          first_seen: incident.first_seen,
          last_seen: incident.last_seen,
          detections: incident.detections,
        },
        null,
        2
      ),
      JSON.stringify(
        verifiedEvents.map((e) => ({
          event_id: e.event_id,
          timestamp: e.timestamp,
          event_type: e.event_type,
          username: e.username,
          source_ip: e.source_ip,
          host: e.host,
          result: e.result,
        })),
        null,
        2
      ),
      JSON.stringify(
        history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
        null,
        2
      )
    );

    const chatTimeoutMs = getGeminiTimeoutMs(45000);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API call timed out')), chatTimeoutMs)
    );

    const apiPromise = ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: INVESTIGATION_SYSTEM_PROMPT },
            { text: prompt },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: CHAT_RESPONSE_SCHEMA,
      },
    });

    const response = await Promise.race([apiPromise, timeoutPromise]);
    const rawText = response.text || '';
    const parsed = JSON.parse(rawText);
    const validated = ChatInvestigationZodSchema.safeParse(parsed);

    if (!validated.success) {
      throw new Error(`Chat validation failed: ${validated.error.message}`);
    }

    // Filter evidence_ids to genuine ones only
    const cleanIds = validated.data.evidence_ids.filter((id) => incident.event_ids.includes(id));
    return {
      ...validated.data,
      evidence_ids: cleanIds,
    };
  } catch (err) {
    console.warn('Gemini chat failed, using deterministic response:', err);
    return generateDeterministicChatResponse(question, incident, verifiedEvents);
  }
}

async function generateDeterministicChatResponse(
  question: string,
  incident: Incident,
  verifiedEvents: NormalizedLogEvent[]
): Promise<ChatInvestigationSchemaType> {
  const q = question.toLowerCase();
  const sorted = [...verifiedEvents].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const failedEvents = sorted.filter((e) => e.result === 'FAILURE');
  const successEvents = sorted.filter((e) => e.result === 'SUCCESS');
  const deniedEvents = sorted.filter((e) => e.result === 'DENIED');

  if (q.includes('amazon') || q.includes('adbt') || q.includes('platform') || q.includes('guideline') || q.includes('device')) {
    let docsSummary: string[] = [];
    try {
      const queryStr = question.replace(/adbt|amazon|check/gi, '').trim() || 'testing';
      const searchResults = await adbtService.searchDocumentation(queryStr);
      if (searchResults && searchResults.length > 0) {
        docsSummary = searchResults
          .slice(0, 3)
          .map((r) => `[${r.documentType}] ${r.uri}: ${r.snippet.replace(/\n+/g, ' ').slice(0, 150)}...`);
      }
    } catch (e) {
      console.warn('ADBT documentation search error in chat:', e);
    }

    return {
      answer: `Consulting Amazon Devices Builder Tools (ADBT) documentation for incident ${incident.id}: retrieved verified Amazon platform workflows and diagnostic guidelines applicable to this investigation.`,
      facts: docsSummary.length > 0 ? docsSummary : [
        'Amazon Devices Builder Tools MCP v1.0.17 provides verified Vega OS and Fire OS developer documentation.',
        `Incident ${incident.id} involves host '${incident.primary_host || 'N/A'}' with ${incident.event_count} verified events.`
      ],
      hypotheses: [
        'Platform security testing workflows in ADBT provide diagnostic benchmarks for anomalous activity.'
      ],
      recommendations: [
        'Access the ADBT Runtime Console at /adbt to execute live MCP tools and inspect platform guides.',
        'Review incident event records and perform credential revocation.'
      ],
      evidence_ids: incident.event_ids.slice(0, 3),
      suggested_actions: [
        'Show me the evidence behind the high risk score.',
        'What happened before the successful login?',
        'Generate the investigation report.'
      ],
    };
  }

  if (q.includes('risk') || q.includes('score') || q.includes('why')) {
    return {
      answer: `Incident ${incident.id} received a ${incident.severity} risk score of ${incident.risk_score}/100 based on ${incident.detections.length} triggered security rule(s) across ${incident.event_count} correlated event records.`,
      facts: incident.detections.map((d) => `${d.rule_name} triggered (+${d.contributing_score} score contribution)`),
      hypotheses: [
        'Adversary leveraged automated password spraying or brute forcing to gain initial access.',
        'Possible account takeover attempt targeting valid corporate credentials.',
      ],
      recommendations: [
        `Review authentication logs from source IP ${incident.primary_ip || 'unknown'}.`,
        `Initiate password reset and revoke active tokens for user '${incident.primary_user || 'unknown'}'.`,
      ],
      evidence_ids: incident.detections.flatMap((d) => d.relevant_event_ids).slice(0, 5),
      suggested_actions: [
        'What happened before the successful login?',
        'Which events support the account-compromise hypothesis?',
        'What should an analyst verify next?',
      ],
    };
  }

  if (q.includes('before') || q.includes('login') || q.includes('prior') || q.includes('timeline')) {
    const preLoginFails = failedEvents.slice(0, 5);
    return {
      answer: `Prior to the successful login event, there were ${failedEvents.length} consecutive authentication failures recorded for ${incident.primary_user || 'the account'} from source IP ${incident.primary_ip || 'N/A'}.`,
      facts: preLoginFails.map(
        (e) => `[${e.timestamp}] Failed login attempt for '${e.username}' from ${e.source_ip} (Event ID: ${e.event_id})`
      ),
      hypotheses: [
        'Pattern is consistent with rapid credential guessing or password spray tools.',
      ],
      recommendations: [
        'Correlate with perimeter firewall or WAF logs to check for automated scanning signatures.',
        'Check if MFA challenge was issued and whether it was bypassed or approved via MFA fatigue.',
      ],
      evidence_ids: [...preLoginFails.map((e) => e.event_id), ...(successEvents[0] ? [successEvents[0].event_id] : [])],
      suggested_actions: [
        'Show me the evidence behind the high risk score.',
        'Which events support the account-compromise hypothesis?',
        'Generate the investigation report.',
      ],
    };
  }

  if (q.includes('next') || q.includes('verify') || q.includes('action') || q.includes('contain')) {
    return {
      answer: `Based on the verified evidence for ${incident.id}, recommended analyst verification priorities focus on credential revocation, session termination, and network origin analysis.`,
      facts: [
        `Affected user: ${incident.primary_user || 'Unknown'}`,
        `Source origin: ${incident.primary_ip || 'Unknown'}`,
        `Target host: ${incident.primary_host || 'Unknown'}`,
      ],
      hypotheses: [
        'If compromised, attacker may establish persistence or initiate lateral movement.',
      ],
      recommendations: [
        'Temporarily suspend or force-reset user credentials.',
        'Terminate all active SSO and OAuth sessions for the affected user.',
        'Block source IP at network edge / firewall if external.',
        'Inspect host endpoint for abnormal child processes or outbound connections.',
      ],
      evidence_ids: incident.event_ids.slice(0, 4),
      suggested_actions: [
        'Generate the investigation report.',
        'Show me the evidence behind the high risk score.',
        'What happened before the successful login?',
      ],
    };
  }

  // Default answer
  return {
    answer: `Investigation of incident ${incident.id} (${incident.title}): ${incident.event_count} events tracked between ${incident.first_seen} and ${incident.last_seen}. Primary user: '${incident.primary_user || 'N/A'}', source IP: '${incident.primary_ip || 'N/A'}'.`,
    facts: [
      `Total correlated events: ${incident.event_count}`,
      `Failed logins: ${failedEvents.length}`,
      `Successful logins: ${successEvents.length}`,
      `Access denied events: ${deniedEvents.length}`,
    ],
    hypotheses: [
      `Suspicious authentication sequence consistent with ${incident.detections.map((d) => d.rule_name).join(', ')}.`,
    ],
    recommendations: [
      'Examine the chronological event timeline for temporal clustering.',
      'Generate a formal investigation report for incident documentation.',
    ],
    evidence_ids: incident.event_ids.slice(0, 5),
    suggested_actions: [
      'Show me the evidence behind the high risk score.',
      'What happened before the successful login?',
      'What should an analyst verify next?',
      'Generate the investigation report.',
    ],
  };
}
