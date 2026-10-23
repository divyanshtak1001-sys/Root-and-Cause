import { NextRequest, NextResponse } from 'next/server';
import * as store from '@/lib/storage/persistence';

export async function GET(
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
    return NextResponse.json({
      success: true,
      data: {
        upload,
        events: events.slice(0, 100),
        totalEvents: events.length,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ uploadId: string }> }
) {
  try {
    const { uploadId } = await context.params;
    const deleted = await store.removeUpload(uploadId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, error: `Upload '${uploadId}' not found` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, message: `Upload '${uploadId}' deleted` });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
