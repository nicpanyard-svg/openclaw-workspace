import { NextResponse } from "next/server";
import { parseVendorQuotePdf } from "@/app/lib/vendor-quote-pdf";
import { apiErrorResponse, readUpload } from "@/app/lib/api-input";
import { checkServerAccess } from "@/app/lib/server-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = checkServerAccess(request);
  if (denied) return denied;
  try {
    const { bytes } = await readUpload(request, "pdf");
    const parsed = await parseVendorQuotePdf(bytes);

    return NextResponse.json(parsed);
  } catch (error) {
    return apiErrorResponse(error, "parse the vendor quote PDF");
  }
}
