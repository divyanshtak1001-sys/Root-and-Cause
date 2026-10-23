import { NextRequest, NextResponse } from 'next/server';
import { parseLogContent, MAX_FILE_SIZE_BYTES } from '@/lib/security/parsers/log-parser';
import * as store from '@/lib/storage/persistence';
import { generateId } from '@/lib/utils';
import { IngestSummary } from '@/types';
import { SecurityDetectionEngine } from '@/lib/security/detections/detection-engine';
import { EventCorrelationEngine } from '@/lib/security/correlation/correlation-engine';
import { metricsStore } from '@/lib/monitoring/metrics';

export async function GET() {
  try {
    const uploads = await store.listUploads();
    return NextResponse.json({ success: true, data: uploads });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let content = '';
    let filename = 'uploaded_logs.json';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided in form data' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: `File size exceeds limit of ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB` },
          { status: 400 }
        );
      }
      filename = file.name;
      content = await file.text();
    } else {
      const body = await req.json();
      // `content` must be the raw log text. A JSON array/object posted as the whole body
      // (rather than wrapped in { content }) used to crash with "content.trim is not a
      // function"; accept it by stringifying, which is exactly what the client meant.
      const rawContent: unknown = body?.content;
      if (typeof rawContent === 'string') {
        content = rawContent;
      } else if (rawContent !== undefined && rawContent !== null) {
        content = JSON.stringify(rawContent);
      } else {
        content = '';
      }
      filename = typeof body?.filename === 'string' ? body.filename : 'uploaded_logs.json';
    }

    if (typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: 'Log content cannot be empty' },
        { status: 400 }
      );
    }

    const uploadId = generateId('upl');
    const { events, errors, totalRows } = parseLogContent(content, filename, uploadId);

    const summary: IngestSummary = {
      upload_id: uploadId,
      filename,
      total_rows: totalRows,
      accepted_rows: events.length,
      rejected_rows: Math.max(0, totalRows - events.length),
      errors: errors.slice(0, 100), // cap error list
      created_at: new Date().toISOString(),
      data_source: 'UPLOADED_FILE',
    };

    const { persisted } = await store.createUpload(summary, events);

    // Run security detections and correlation automatically on the ingested events
    let incidentsCreated = 0;
    // With no incidents there is nothing to persist, so treat that as success rather
    // than reporting `persisted: false`, which wrongly implied a failed cloud write.
    let incidentsPersisted = true;
    if (events.length > 0) {
      const detector = new SecurityDetectionEngine();
      const detections = detector.runDetections(events);

      const correlator = new EventCorrelationEngine();
      const newIncidents = correlator.correlate(events, detections);
      incidentsCreated = newIncidents.length;
      if (incidentsCreated > 0) {
        const incidentResult = await store.upsertIncidents(newIncidents);
        incidentsPersisted = incidentResult.persisted;
      }

      metricsStore.recordDetectionRun(detections.length, incidentsCreated);
    }

    metricsStore.recordUpload(summary.accepted_rows, summary.rejected_rows);

    return NextResponse.json({
      success: true,
      data: {
        summary,
        sampleEvents: events.slice(0, 10),
        incidentsCreated,
        persistence: {
          mode: store.getPersistenceMode(),
          persisted: persisted && incidentsPersisted,
        },
      },
    });
  } catch (err: unknown) {
    metricsStore.recordUploadFailure(err);
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
