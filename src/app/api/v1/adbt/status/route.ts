import { NextResponse } from 'next/server';
import { adbtService } from '@/lib/adbt/adbt-service';

export async function GET() {
  try {
    const health = await adbtService.getHealthStatus();
    return NextResponse.json({
      success: true,
      data: health,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
