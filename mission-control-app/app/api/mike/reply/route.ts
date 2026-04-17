import { NextRequest } from "next/server";
import { readQueue, writeQueue } from "../queue/route";
import type { OutreachItem } from "../queue/route";

// POST /api/mike/reply — queue a reply draft for approval before sending
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { messageId, leadId, leadName, company, replyTo, subject, body: replyBody } = body;

  if (!replyTo || !replyBody) {
    return Response.json({ error: "replyTo and body are required" }, { status: 400 });
  }

  const item: OutreachItem = {
    id: crypto.randomUUID(),
    leadId: leadId || undefined,
    leadName: leadName ?? "",
    company: company ?? "",
    email: replyTo,
    // Store original messageId in subject prefix so the [id] PUT handler can use it
    subject: subject ?? `Re: (reply)`,
    body: replyBody,
    status: "pending",
    createdAt: new Date().toISOString(),
    // Stash original message id for threaded reply
    ...(messageId ? { replyToMessageId: messageId } : {}),
  } as OutreachItem & { replyToMessageId?: string };

  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);

  return Response.json({ item }, { status: 201 });
}
