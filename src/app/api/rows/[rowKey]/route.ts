import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Aggiorna solo i dati custom (note, colonne aggiunte) di una riga.
// I dati sorgente (colonne del file Excel) non sono mai modificabili da qui:
// l'app non scrive mai sul file su SharePoint.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ rowKey: string }> }
) {
  const { rowKey } = await params;
  const body = await req.json();

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }

  const existing = await prisma.customRow.findUnique({ where: { rowKey } });
  const merged = { ...(existing?.data as Record<string, unknown> | undefined), ...body };

  const row = await prisma.customRow.upsert({
    where: { rowKey },
    create: { rowKey, data: merged },
    update: { data: merged },
  });

  return NextResponse.json({ ok: true, row });
}
