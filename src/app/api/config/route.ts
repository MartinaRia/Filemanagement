import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const ConfigSchema = z.object({
  worksheetName: z.string().optional().nullable(),
  keyColumn: z.string().optional().nullable(),
  worksheetName2: z.string().optional().nullable(),
  keyColumn2: z.string().optional().nullable(),
  hiddenColumnsForViewer: z.array(z.string()).optional(),
});

export async function GET() {
  const config = await prisma.appConfig.findUnique({ where: { id: 1 } });
  const columnDefs = await prisma.customColumnDef.findMany({ orderBy: { order: "asc" } });
  const lastUpload = await prisma.uploadLog.findFirst({ orderBy: { startedAt: "desc" } });
  return NextResponse.json({ config, columnDefs, lastUpload });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = ConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = await prisma.appConfig.upsert({
    where: { id: 1 },
    create: { id: 1, ...parsed.data },
    update: parsed.data,
  });

  return NextResponse.json({ ok: true, config });
}
