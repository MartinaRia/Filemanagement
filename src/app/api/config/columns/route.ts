import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";

const ColumnSchema = z.object({
  key: z
    .string()
    .min(1)
    .regex(/^[a-zA-Z0-9_]+$/, "Usa solo lettere, numeri e underscore"),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "select", "date", "number", "checkbox"]),
  options: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ColumnSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const count = await prisma.customColumnDef.count();
  const column = await prisma.customColumnDef.create({
    data: { ...parsed.data, order: count },
  });

  return NextResponse.json({ ok: true, column });
}
