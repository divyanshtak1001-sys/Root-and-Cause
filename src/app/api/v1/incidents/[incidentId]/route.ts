import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';
import { IncidentStatus } from '@/types';

export async function GET(
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
    const report = await store.getReport(incidentId);

    return NextResponse.json({
      success: true,
      data: {
        incident,
        events,
        report: report || null,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ incidentId: string }> }
) {
  try {
    const { incidentId } = await context.params;
    const body = await req.json();
    const status = body.status as IncidentStatus;

    if (!['NEW', 'TRIAGED', 'INVESTIGATING', 'CONTAINED', 'CLOSED'].includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid incident status: ${status}` },
        { status: 400 }
      );
    }

    const updated = await store.setIncidentStatus(incidentId, status);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: `Incident '${incidentId}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
