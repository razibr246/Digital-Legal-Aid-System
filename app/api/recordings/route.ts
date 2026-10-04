import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BucketObject {
  body: ReadableStream | null;
}

interface BucketBinding {
  put(key: string, value: ReadableStream, options?: { httpMetadata?: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<BucketObject | null>;
}

function getToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("auth_session="))
    ?.slice("auth_session=".length);
}

function getBindings(): { db: D1Database; bucket: BucketBinding } | null {
  try {
    const context = getCloudflareContext() as unknown as {
      env?: { DB?: D1Database; CALL_RECORDINGS_R2?: BucketBinding };
    };
    if (!context.env?.DB || !context.env.CALL_RECORDINGS_R2) return null;
    return { db: context.env.DB, bucket: context.env.CALL_RECORDINGS_R2 };
  } catch {
    return null;
  }
}

async function getRequestUser(request: Request, db: D1Database | null): Promise<SessionUser | null> {
  const token = getToken(request);
  return (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
}

export async function POST(request: Request) {
  const bindings = getBindings();
  const user = await getRequestUser(request, bindings?.db || null);
  if (!user || user.role !== "citizen") {
    return NextResponse.json({ ok: false, error: "Authenticated citizen session required" }, { status: 401 });
  }
  if (!bindings) {
    return NextResponse.json({ ok: false, error: "Recording storage is not configured" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const voiceSessionId = String(formData.get("voiceSessionId") || "").trim();
    const docketId = String(formData.get("docketId") || "").trim() || null;
    const durationMs = Math.max(0, Number(formData.get("durationMs") || 0));
    if (!file || typeof file === "string" || !voiceSessionId) {
      return NextResponse.json({ ok: false, error: "Recording file and voice session are required" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: "Recording must be between 1 byte and 50 MB" }, { status: 400 });
    }

    const contentType = file.type || "audio/webm";
    if (!contentType.startsWith("audio/")) {
      return NextResponse.json({ ok: false, error: "Only audio recordings are accepted" }, { status: 415 });
    }
    const safeVoiceSessionId = voiceSessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const recordingId = `rec-${safeVoiceSessionId}`;
    const extension = contentType.includes("mp4") ? "mp4" : contentType.includes("ogg") ? "ogg" : "webm";
    const objectKey = `recordings/${safeVoiceSessionId}.${extension}`;
    await bindings.bucket.put(objectKey, file.stream(), { httpMetadata: { contentType } });
    await bindings.db
      .prepare(
        `INSERT OR REPLACE INTO call_recordings
         (id, voice_session_id, docket_id, citizen_user_id, object_key, content_type, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(recordingId, voiceSessionId, docketId, user.id, objectKey, contentType, Math.round(durationMs))
      .run();

    return NextResponse.json({ ok: true, recordingId, docketId }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const bindings = getBindings();
  const user = await getRequestUser(request, bindings?.db || null);
  if (!user || user.role === "citizen") {
    return NextResponse.json({ ok: false, error: "Staff session required" }, { status: 401 });
  }
  if (!bindings) {
    return NextResponse.json({ ok: false, error: "Recording storage is not configured" }, { status: 503 });
  }

  try {
    const url = new URL(request.url);
    const recordingId = url.searchParams.get("recordingId");
    if (recordingId) {
      const row = await bindings.db
        .prepare("SELECT object_key, content_type FROM call_recordings WHERE id = ? LIMIT 1")
        .bind(recordingId)
        .first<{ object_key: string; content_type: string }>();
      if (!row) return NextResponse.json({ ok: false, error: "Recording not found" }, { status: 404 });
      const object = await bindings.bucket.get(row.object_key);
      if (!object?.body) return NextResponse.json({ ok: false, error: "Recording object not found" }, { status: 404 });
      return new Response(object.body, {
        headers: {
          "Content-Type": row.content_type,
          "Cache-Control": "private, no-store",
          "Content-Disposition": "inline",
        },
      });
    }

    const docketId = url.searchParams.get("docketId");
    if (!docketId) return NextResponse.json({ ok: true, recording: null });
    const row = await bindings.db
      .prepare(
        `SELECT id, voice_session_id, docket_id, content_type, duration_ms, created_at
         FROM call_recordings WHERE docket_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .bind(docketId)
      .first<{
        id: string;
        voice_session_id: string;
        docket_id: string;
        content_type: string;
        duration_ms: number;
        created_at: string;
      }>();
    return NextResponse.json({
      ok: true,
      recording: row
        ? {
            id: row.id,
            voiceSessionId: row.voice_session_id,
            docketId: row.docket_id,
            contentType: row.content_type,
            durationMs: row.duration_ms,
            createdAt: row.created_at,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
