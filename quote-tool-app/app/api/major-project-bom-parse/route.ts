import { NextResponse } from "next/server";
import { parseMajorProjectBomWorkbookBytes } from "@/app/lib/bom-workbook-parse";
import { apiErrorResponse, readUpload } from "@/app/lib/api-input";
import { checkServerAccess } from "@/app/lib/server-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = checkServerAccess(request);
  if (denied) return denied;
  try {
    const { file, bytes } = await readUpload(request, "workbook");
    const parsed = await parseMajorProjectBomWorkbookBytes({
      bytes,
      fileName: file.name,
    });

    return NextResponse.json(parsed);
  } catch (error) {
    return apiErrorResponse(error, "parse the workbook");
  }
}
