import { NextResponse } from "next/server";
import { generateReportPptx } from "@/lib/pptx-report";

export async function POST() {
  try {
    const buffer = await generateReportPptx();
    const fileName = `SAL-PM-IT-${new Date().toISOString().slice(0, 10)}.pptx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
