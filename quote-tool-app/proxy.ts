import { NextResponse, type NextRequest } from "next/server";
import { checkServerAccess } from "./app/lib/server-access";

export function proxy(request: NextRequest) {
  return checkServerAccess(request) ?? NextResponse.next();
}

export const config = { matcher: "/:path*" };
