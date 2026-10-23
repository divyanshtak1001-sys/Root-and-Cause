import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';
import { chatInvestigation } from '@/lib/ai/generate-investigation';
import { ChatMessage } from '@/types';
import { EvidenceManager } from '@/lib/security/evidence/evidence-manager';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ incidentId: string }> }
) {
  try {
    const { incidentId } = await context.params;
    const incident = await store.getIncident(incidentId);
    if (!incident) {
      return NextResponse.json(
        { success: false, error: `Incident '${incidentId}' not found` },
        { status: 404 }
      );
    }

    const body = await req.json();
    const rawQuestion = body.question || '';
    const history: ChatMessage[] = body.history || [];

    if (!rawQuestion.trim()) {
      return NextResponse.json(
        { success: false, error: 'Question cannot be empty' },
        { status: 400 }
      );
    }

    // Sanitize user prompt to prevent control char injections
    const sanitizedQuestion = EvidenceManager.sanitizeUntrustedText(rawQuestion);

    const events = await store.getEventsByIds(incident.event_ids);
    const chatResult = await chatInvestigation(sanitizedQuestion, incident, events, history);

    return NextResponse.json({
      success: true,
      data: chatResult,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
