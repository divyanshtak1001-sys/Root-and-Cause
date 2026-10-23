import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/storage/data-store';
import * as store from '@/lib/storage/persistence';
import { clearWorkspaceData } from '@/lib/storage/supabase-store';

export async function POST() {
  try {
    // Clear durable rows first so a reseed cannot leave stale incidents behind.
    let cleared = false;
    if (store.getPersistenceMode() === 'supabase') {
      cleared = await clearWorkspaceData();
    }

    dataStore.seedDemoData();

    // Mirror the freshly seeded fixtures into Supabase. Order matters: incidents have a
    // foreign key to log_events via incident_events, so events MUST be written first.
    const seededUploads = dataStore.getUploads();
    for (const upload of seededUploads) {
      await store.createUpload(upload, dataStore.getEvents(upload.upload_id));
    }

    const seededIncidents = dataStore.getIncidents();
    const { persisted } = await store.upsertIncidents(seededIncidents);

    const stats = {
      totalEvents: dataStore.getStats().totalEvents,
      totalIncidents: seededIncidents.length,
      totalUploads: seededUploads.length,
      persistence: { mode: store.getPersistenceMode(), cleared, persisted },
    };

    return NextResponse.json({
      success: true,
      message: 'Demo dataset re-seeded successfully',
      data: stats,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
