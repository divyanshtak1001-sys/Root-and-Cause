import { NextRequest, NextResponse } from 'next/server';
import { adbtService } from '@/lib/adbt/adbt-service';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const docType = searchParams.get('documentType') as
      | 'KB'
      | 'PROMPT'
      | 'STEERING'
      | 'WORKFLOW'
      | 'SKILL'
      | null;
    const deviceOs = (searchParams.get('os') as 'vega_os' | 'fire_os') || 'vega_os';

    const health = await adbtService.getHealthStatus();
    let documents: unknown[] = [];

    if (health.status === 'ONLINE') {
      documents = await adbtService.listDocuments(docType || undefined, deviceOs);
    }

    return NextResponse.json({
      success: true,
      data: {
        tools: health.availableTools,
        toolCount: health.toolCount,
        documentsCount: documents.length,
        documents: documents.slice(0, 50),
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
