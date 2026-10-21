export const MAX_API_BODY_BYTES = 4 * 1024 * 1024;

export class ApiInputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export async function readBoundedBody(request: Request) {
  const size = Number(request.headers.get("content-length"));
  if (size > MAX_API_BODY_BYTES) throw new ApiInputError("Upload must be 4 MB or smaller.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ApiInputError("Missing request body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_API_BODY_BYTES) { await reader.cancel(); throw new ApiInputError("Upload must be 4 MB or smaller.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export function checkRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  // Next's Node adapter can use its internal hostname in request.url. The Host
  // header retains the browser's destination, including its port.
  const host = request.headers.get("host") ?? url.host;
  let sameOrigin = !origin;
  if (origin) {
    try {
      const source = new URL(origin);
      sameOrigin = ["http:", "https:"].includes(source.protocol) && source.host === host &&
        (url.protocol !== "https:" || source.protocol === "https:");
    } catch { sameOrigin = false; }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site" || !sameOrigin) throw new ApiInputError("Cross-site requests are not allowed.", 403);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  checkRequestOrigin(request);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiInputError("Expected a JSON request.", 415);
  const bytes = await readBoundedBody(request);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiInputError("Invalid JSON request."); }
}

export async function readUpload(request: Request, type: "pdf" | "workbook") {
  checkRequestOrigin(request);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) throw new ApiInputError("Expected a file upload.", 415);
  const bytes = await readBoundedBody(request);
  let form: FormData;
  try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new ApiInputError("Invalid file upload."); }
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) throw new ApiInputError("Choose a non-empty file.");
  const validExtension = type === "pdf" ? /\.pdf$/i : /\.(xlsx|xls|csv)$/i;
  if (!validExtension.test(file.name)) throw new ApiInputError(type === "pdf" ? "Choose a PDF file." : "Choose an XLSX, XLS, or CSV workbook.", 415);
  const contents = new Uint8Array(await file.arrayBuffer());
  if (type === "pdf" && !new TextDecoder().decode(contents.subarray(0, 1024)).includes("%PDF-")) throw new ApiInputError("File is not a valid PDF.");
  return { file, bytes: contents };
}

export function apiErrorResponse(error: unknown, operation: string) {
  if (error instanceof ApiInputError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  const requestId = crypto.randomUUID();
  // No document content, credentials, or provider response bodies in logs or responses.
  console.error(JSON.stringify({ event: "rapidquote_api_error", operation, requestId, errorType: error instanceof Error ? error.name : "UnknownError" }));
  return Response.json({ error: `Unable to ${operation}. Please try again or contact support.`, requestId }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
