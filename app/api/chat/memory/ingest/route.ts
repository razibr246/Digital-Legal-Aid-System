import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { ingestMemoryBatch, listMemoryBatches, MemoryIngestError } from "@/lib/chat/memory/ingest";
import type { MemoryBatch } from "@/lib/chat/memory/types";
import { getD1SessionUser } from "@/lib/auth/d1-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") || "";
  return header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

/**
 * Memory ingestion for the data control center.
 *
 * Two ways in, both deliberate:
 *  - a shared secret header, for a server-to-server push; or
 *  - a staff session, so an officer can correct a fact from the portal.
 *
 * This endpoint deliberately does NOT require the citizen audience: it is
 * operational surface, not the universal assistant.
 */
function isAuthorised(request: Request, secret: string | undefined, user: { role: string } | null): boolean {
  const provided = request.headers.get("x-memory-key") || "";
  if (secret && provided && provided === secret) return true;
  return user !== null && user.role !== "citizen";
}

export async function POST(request: Request) {
  const ctx = getCloudflareContext() as unknown as {
    env?: { DB?: unknown; MEMORY_INGEST_KEY?: string };
  };

  const user = await getD1SessionUser(
    (ctx.env?.DB ?? null) as never,
    readCookie(request, "auth_session"),
  );
  if (!isAuthorised(request, ctx.env?.MEMORY_INGEST_KEY, user)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 401 });
  }

  let batch: MemoryBatch;
  try {
    batch = (await request.json()) as MemoryBatch;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const result = await ingestMemoryBatch(ctx.env?.DB, batch);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof MemoryIngestError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }
    console.error("[api/chat/memory/ingest]", error);
    return NextResponse.json(
      { ok: false, error: "Memory could not be updated" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const ctx = getCloudflareContext() as unknown as {
    env?: { DB?: unknown; MEMORY_INGEST_KEY?: string };
  };
  const user = await getD1SessionUser(
    (ctx.env?.DB ?? null) as never,
    readCookie(request, "auth_session"),
  );
  if (!isAuthorised(request, ctx.env?.MEMORY_INGEST_KEY, user)) {
    return NextResponse.json({ ok: false, error: "Not authorised" }, { status: 401 });
  }
  const batches = await listMemoryBatches(ctx.env?.DB);
  return NextResponse.json({ ok: true, batches });
}
