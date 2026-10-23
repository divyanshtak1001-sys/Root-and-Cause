import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';
import { generateInvestigationReport } from '@/lib/ai/generate-investigation';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ incidentId: string }> }
) {
  try {
    const { incidentId } = await context.params;
    const report = await store.getReport(incidentId);
    if (!report) {
      return NextResponse.json(
        { success: false, error: `Report for incident '${incidentId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: report });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(
  _req: NextRequest,
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

    const events = await store.getEventsByIds(incident.event_ids);
    const { report, usedFallback, fallbackReason } = await generateInvestigationReport(incident, events);

    // Save report to data store
    const { persisted } = await store.storeReport(report);

    return NextResponse.json({
      success: true,
      data: {
        report,
        usedFallback,
        fallbackReason: fallbackReason || null,
        persistence: { mode: store.getPersistenceMode(), persisted },
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
