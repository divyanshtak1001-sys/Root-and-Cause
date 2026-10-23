import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';
import { SecurityDetectionEngine } from '@/lib/security/detections/detection-engine';
import { EventCorrelationEngine } from '@/lib/security/correlation/correlation-engine';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId } = await context.params;
    const upload = await store.getUpload(uploadId);
    if (!upload) {
      return NextResponse.json(
        { success: false, error: `Upload '${uploadId}' not found` },
        { status: 404 }
      );
    }

    const events = await store.listEvents(uploadId);
    if (events.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No events found for this upload' },
        { status: 400 }
      );
    }

    const detector = new SecurityDetectionEngine();
    const detections = detector.runDetections(events);

    const correlator = new EventCorrelationEngine();
    const incidents = correlator.correlate(events, detections);
    const { persisted } = await store.upsertIncidents(incidents);

    return NextResponse.json({
      success: true,
      data: {
        detectionsCount: detections.length,
        incidentsCount: incidents.length,
        incidents,
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
