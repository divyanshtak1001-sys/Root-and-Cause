import { NextResponse, connection } from 'next/server';
import * as store from '@/lib/storage/persistence';

export async function GET() {
  // The store is mutated by uploads/seeds, so these stats must be read per request.
  // Without this, Next.js prerenders the handler at build time and serves a stale
  // "HIT" forever (dashboard counters stuck at the seed-only baseline).
  await connection();

  try {
    const incidents = await store.listIncidents();
    const uploads = await store.listUploads();
    const events = await store.listEvents();

    const severityCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    incidents.forEach((inc) => {
      if (severityCounts[inc.severity] !== undefined) severityCounts[inc.severity]++;
    });

    const avgRisk =
      incidents.length > 0
        ? Math.round(incidents.reduce((acc, i) => acc + i.risk_score, 0) / incidents.length)
        : 0;

    const stats = {
      totalEvents: events.length,
      totalIncidents: incidents.length,
      severityCounts,
      averageRiskScore: avgRisk,
      totalUploads: uploads.length,
      persistence: { mode: store.getPersistenceMode() },
    };

    return NextResponse.json(
      { success: true, data: stats },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
