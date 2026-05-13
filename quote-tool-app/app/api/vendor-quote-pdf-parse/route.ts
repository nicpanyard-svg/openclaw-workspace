import { NextResponse } from "next/server";
import { parseVendorQuotePdf } from "@/app/lib/vendor-quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = await parseVendorQuotePdf(bytes);

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to parse vendor quote PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
