import { NextResponse } from "next/server";
import { getMergedRows } from "@/lib/merge";

export async function GET() {
  try {
    const { rows, columnDefs } = await getMergedRows();
    return NextResponse.json({ rows, columnDefs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
