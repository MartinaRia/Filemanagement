import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Elimina solo la definizione della colonna: i valori gia' salvati nelle
// righe (CustomRow.data) restano nel JSON ma non vengono piu' mostrati,
// cosi' non si perde storicamente il dato per errore da un click.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.customColumnDef.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
