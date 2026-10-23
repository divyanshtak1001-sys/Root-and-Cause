import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adbtService } from '@/lib/adbt/adbt-service';
import { AdbtToolName } from '@/lib/adbt/adbt-types';

const AllowedAdbtTools = z.enum([
  'list_documents',
  'search_documentation',
  'read_document',
]);

const ExecRequestSchema = z.object({
  tool: AllowedAdbtTools,
  args: z.record(z.string(), z.unknown()),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = ExecRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid ADBT execution request: ${validated.error.message}`,
        },
        { status: 400 }
      );
    }

    const { tool, args } = validated.data;
    const result = await adbtService.executeTool(tool as AdbtToolName, args);

    return NextResponse.json({
      success: true,
      tool,
      data: result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
