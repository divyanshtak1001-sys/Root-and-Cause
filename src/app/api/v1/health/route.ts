import { NextResponse, connection } from 'next/server';
import { checkConnection, getPersistenceMode } from '@/lib/storage/persistence';
import { isGeminiConfigured, getGeminiModelName } from '@/lib/ai/gemini-client';
import { metricsStore } from '@/lib/monitoring/metrics';
import { adbtService } from '@/lib/adbt/adbt-service';

/**
 * Live operational status.
 *
 * Supabase is a real round-trip query (not a config check). Counters are accumulated by
 * the code paths that actually run, so they reflect observed behaviour in this process.
 *
 * Limitation stated explicitly in the payload: the app analyses logs on upload. It does
 * not continuously monitor any external system.
 */
export async function GET() {
  await connection();

  const mode = getPersistenceMode();
  const { connected } = await checkConnection();
  const cloudConfigured = mode === 'supabase';
  const healthy = !cloudConfigured || connected;

  const adbt = (() => {
    try {
      return { installed: adbtService.isInstalled(), connected: true, error: null as string | null };
    } catch (error) {
      return {
        installed: false,
        connected: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  })();

  const metrics = metricsStore.snapshot();
  const geminiConfigured = isGeminiConfigured();

  return NextResponse.json(
    {
      success: healthy,
      data: {
        status: healthy ? 'ready' : 'degraded',
        persistence: {
          mode,
          cloudConfigured,
          cloudConnected: cloudConfigured && connected,
        },
        ai: {
          provider: 'google-gemini',
          configured: geminiConfigured,
          model: getGeminiModelName(),
          mode: geminiConfigured ? 'live_eligible' : 'deterministic_fallback',
        },
        adbt,
        analysisMode: 'on_demand',
        analysisModeNote:
          'Logs are analysed when uploaded. There is no continuous or scheduled monitoring of external systems.',
        metrics,
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
