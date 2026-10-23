import { z } from 'zod';

export const InvestigationReportZodSchema = z.object({
  title: z.string().describe('Clear, technical investigation title summarizing the primary incident'),
  executive_summary: z.string().describe('Concise executive summary for security leaders detailing the risk, actor, and findings'),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  risk_score: z.number().min(0).max(100),
  observations: z.array(z.string()).describe('Factual findings observed directly from the log evidence'),
  evidence_references: z.array(z.string()).describe('List of actual event_ids cited in this report. Must only contain genuine event IDs provided in the context.'),
  event_timeline: z.array(
    z.object({
      event_id: z.string(),
      timestamp: z.string(),
      summary: z.string(),
      significance: z.string(),
    })
  ).describe('Chronological event progression directly supported by verified logs'),
  likely_explanations: z.array(z.string()).describe('Plausible technical hypotheses explaining the observed activity (e.g., brute force, credential stuffing)'),
  uncertainty: z.array(z.string()).describe('Known ambiguities, missing data sources, or limitations in the findings'),
  recommended_verification_steps: z.array(z.string()).describe('Concrete next actions for SOC analysts to verify or contain the incident'),
  relevant_attack_techniques: z.array(z.string()).describe('MITRE ATT&CK technique IDs (e.g. T1110, T1078) applicable to the verified findings'),
});

export type InvestigationReportSchemaType = z.infer<typeof InvestigationReportZodSchema>;

export const ChatInvestigationZodSchema = z.object({
  answer: z.string().describe('Direct conversational answer to the analyst question, grounded strictly in provided log records'),
  facts: z.array(z.string()).describe('Verified facts established by log evidence'),
  hypotheses: z.array(z.string()).describe('Analytical hypotheses or potential explanations'),
  recommendations: z.array(z.string()).describe('Actionable SOC verification steps or containment advice'),
  evidence_ids: z.array(z.string()).describe('Event IDs cited as proof for the statements made'),
  suggested_actions: z.array(z.string()).describe('Follow-up questions the analyst might want to ask'),
});

export type ChatInvestigationSchemaType = z.infer<typeof ChatInvestigationZodSchema>;
