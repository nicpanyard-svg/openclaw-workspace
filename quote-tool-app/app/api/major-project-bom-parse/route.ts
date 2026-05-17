import { NextResponse } from "next/server";
import { parseMajorProjectBomWorkbookBytes } from "@/app/lib/bom-workbook-parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing workbook file." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await parseMajorProjectBomWorkbookBytes({
      bytes,
      fileName: file.name,
    });

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse workbook.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
