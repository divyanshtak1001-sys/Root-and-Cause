import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const severity = searchParams.get('severity')?.toUpperCase();
    const status = searchParams.get('status')?.toUpperCase();
    const search = searchParams.get('search')?.toLowerCase();

    let incidents = await store.listIncidents();

    if (severity && severity !== 'ALL') {
      incidents = incidents.filter((i) => i.severity === severity);
    }

    if (status && status !== 'ALL') {
      incidents = incidents.filter((i) => i.status === status);
    }

    if (search) {
      incidents = incidents.filter((i) =>
        i.title.toLowerCase().includes(search) ||
        i.summary.toLowerCase().includes(search) ||
        (i.primary_user && i.primary_user.toLowerCase().includes(search)) ||
        (i.primary_ip && i.primary_ip.includes(search))
      );
    }

    // Attach provenance by resolving each incident's events back to their source upload.
    // Seeded demo events belong to `upl_demo_master` => SYNTHETIC_DEMO; anything else is
    // a real file upload. This keeps demo data from being presented as live security events.
    const uploads = await store.listUploads();
    const sourceByUploadId = new Map(uploads.map((u) => [u.upload_id, u.data_source ?? 'UPLOADED_FILE']));

    const withProvenance = await Promise.all(
      incidents.map(async (incident) => {
        const events = await store.getEventsByIds(incident.event_ids.slice(0, 50));
        const sources = new Set(events.map((e) => sourceByUploadId.get(e.upload_id ?? '') ?? 'UPLOADED_FILE'));
        const data_source =
          sources.size === 1 ? [...sources][0] : sources.size > 1 ? 'MIXED' : 'UPLOADED_FILE';
        return { ...incident, data_source };
      })
    );

    return NextResponse.json({
      success: true,
      data: withProvenance,
      total: withProvenance.length,
      persistence: { mode: store.getPersistenceMode() },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
