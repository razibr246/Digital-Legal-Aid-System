import {
  buildProgress,
  upsertStepStatement,
  VERIFICATION_STEPS,
  type VerificationStepId,
  type VerificationStepState,
} from "./steps";

interface StepEnv {
  DB: {
    prepare(sql: string): {
      bind(...values: unknown[]): {
        run(): Promise<unknown>;
        all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
      };
      all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
    };
    batch(statements: unknown[]): Promise<unknown>;
  };
  CALL_RECORDINGS_R2?: {
    put(key: string, value: ArrayBuffer | Uint8Array | string, options?: unknown): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
  DEEPINFRA_API_KEY?: string;
}

type Json = Record<string, unknown>;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return json({ ok: false, error: message }, 400);
}

const MAX_SIGNATURE_BYTES = 512 * 1024;

/** Progress across the three citizen verification tasks. */
export async function handleVerificationProgressRequest(
  request: Request,
  env: StepEnv,
  user: { id: string } | null,
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { results } = await env.DB.prepare(
    `SELECT step, status, result_json, completed_at
     FROM verification_steps
     WHERE user_id = ?
     ORDER BY step`,
  )
    .bind(user.id)
    .all<{ step: VerificationStepId; status: string; result_json: string | null; completed_at: string | null }>();

  const states: VerificationStepState[] = (results ?? []).map((row) => {
    let result: Record<string, unknown> | null = null;
    try {
      result = row.result_json ? (JSON.parse(row.result_json) as Record<string, unknown>) : null;
    } catch {
      result = null;
    }
    return {
      id: row.step,
      status: row.status === "complete" ? "complete" : "pending",
      completedAt: row.completed_at,
      result,
    };
  });

  return json({
    ok: true,
    definitions: VERIFICATION_STEPS,
    progress: buildProgress(states),
  });
}

/**
 * SIMULATED face match.
 *
 * This is explicitly a simulation: there is no face-recognition model and no
 * template is ever compared. The submitted selfie is validated for shape and
 * then DISCARDED — it is never written to D1 or R2 — because storing citizen
 * biometrics without a lawful basis and consent is not acceptable. Only a
 * derived match score and a liveness flag are kept, so the UI can demonstrate
 * the flow end to end.
 */
export async function handleFaceMatchRequest(
  request: Request,
  env: StepEnv,
  user: { id: string; displayName: string } | null,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  try {
    const form = (await request.formData()) as FormData;
    const photo = form.get("selfie");
    const consented = String(form.get("consent") || "") === "true";
    if (!consented) {
      return badRequest("মুখের ছবি যাচাইয়ের সম্মতি দেওয়া আবশ্যক");
    }
    if (!photo || typeof photo === "string" || photo.size === 0) {
      return badRequest("সেলফি ছবি পাওয়া যায়নি");
    }
    if (!/^image\/(jpeg|png|webp)$/.test(photo.type || "")) {
      return badRequest("শুধুমাত্র JPEG, PNG বা WebP ছবি গ্রহণযোগ্য");
    }
    if (photo.size > 6 * 1024 * 1024) {
      return badRequest("ছবির আকার ৬ মেগাবাইটের বেশি হতে পারে");
    }

    // The identity document must exist before a face can be compared to it.
    const document = await env.DB.prepare(
      `SELECT id, document_type, document_number_masked, name_en, name_bn, status
       FROM identity_verifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
      .bind(user.id)
      .all<{
        id: string;
        document_type: string;
        document_number_masked: string;
        name_en: string | null;
        name_bn: string | null;
        status: string;
      }>();

    const doc = document.results?.[0];
    if (!doc) {
      return json({ ok: false, error: "প্রথমে পরিচয়পত্র যাচাই করুন", stage: "document_required" }, 409);
    }

    // Derived deterministically from the image bytes so a retry is stable,
    // without ever persisting or transmitting the biometric itself.
    const bytes = new Uint8Array(await photo.arrayBuffer());
    let hash = 0;
    for (let i = 0; i < bytes.length; i += 7) hash = (hash * 31 + bytes[i]) % 1000003;
    const matchScore = Number((0.82 + (hash % 1700) / 10000).toFixed(4));
    const liveness = hash % 7 !== 0 ? "passed" : "retry";
    const isMatch = matchScore >= 0.9;

    const result = {
      matchScore,
      isMatch,
      liveness,
      threshold: 0.9,
      documentType: doc.document_type,
      documentNumberMasked: doc.document_number_masked,
      engine: "simulated",
      model: "simulated-no-model",
      imageRetained: false,
      checkedAt: new Date().toISOString(),
    };

    if (isMatch && liveness === "passed") {
      await upsertStepStatement(env, user.id, "face", result, "simulated").run();
    }

    return json({ ok: true, face: { ...result, simulated: true } });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

/** Stores a drawn e-signature in R2 and records consent + the document it signs. */
export async function handleSaveSignatureRequest(
  request: Request,
  env: StepEnv,
  user: { id: string; displayName: string } | null,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!env.CALL_RECORDINGS_R2) return json({ ok: false, error: "Signature storage unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  try {
    const body = (await request.json()) as Json;
    const dataUrl = String(body.dataUrl || "");
    const consent = body.consent === true;
    const signedName = String(body.signedName || user.displayName).trim().slice(0, 120);

    if (!consent) return badRequest("ই-স্বাক্ষর সংরক্ষণের সম্মতি দিন");
    const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
    if (!match) return badRequest("স্বাক্ষরের ছবি (PNG) দিন");

    const binary = atob(match[1]);
    if (binary.length === 0) return badRequest("স্বাক্ষরের ছবি খালি");
    if (binary.length > MAX_SIGNATURE_BYTES) {
      return badRequest("স্বাক্ষরের ছবির আকার বেশি");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const signatureId = `SIG-${crypto.randomUUID()}`;
    const safeUserId = user.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const objectKey = `signatures/${safeUserId}/${signatureId}.png`;

    await env.CALL_RECORDINGS_R2.put(objectKey, bytes, {
      httpMetadata: { contentType: "image/png" },
    });

    const document = await env.DB.prepare(
      "SELECT document_type, document_number_masked FROM identity_verifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    )
      .bind(user.id)
      .all<{ document_type: string; document_number_masked: string }>();
    const doc = document.results?.[0];

    // D1 batch() takes prepared statements, not promises.
    await env.DB.batch([
      // Only the newest signature stays active; older ones are revoked, not deleted.
      env.DB.prepare("UPDATE citizen_signatures SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL")
        .bind(user.id),
      env.DB.prepare(
        `INSERT INTO citizen_signatures
          (id, user_id, object_key, content_type, byte_size, sha256, width, height, consent, signed_name, document_type, document_number_masked)
         VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?, 1, ?, ?, ?)`,
      ).bind(
        signatureId,
        user.id,
        objectKey,
        bytes.length,
        sha256,
        Number(body.width) || null,
        Number(body.height) || null,
        signedName,
        doc?.document_type ?? null,
        doc?.document_number_masked ?? null,
      ),
      upsertStepStatement(
        env,
        user.id,
        "signature",
        { signatureId, sha256: sha256.slice(0, 16), byteSize: bytes.length, consentedAt: new Date().toISOString() },
        "self_service",
      ),
    ]);

    return json({
      ok: true,
      signature: { id: signatureId, byteSize: bytes.length, sha256, signedName, savedAt: new Date().toISOString() },
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function handleSignatureRequest(
  request: Request,
  env: StepEnv,
  user: { id: string } | null,
): Promise<Response> {
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  if (request.method === "GET") {
    const row = await env.DB.prepare(
      `SELECT id, byte_size, sha256, signed_name, document_type, document_number_masked, created_at
       FROM citizen_signatures
       WHERE user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
      .bind(user.id)
      .all();
    return json({ ok: true, signature: row.results?.[0] ?? null });
  }

  if (request.method === "DELETE") {
    const active = await env.DB.prepare(
      "SELECT id, object_key FROM citizen_signatures WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1",
    )
      .bind(user.id)
      .all<{ id: string; object_key: string }>();
    const signature = active.results?.[0];
    if (signature) {
      await env.DB.prepare("UPDATE citizen_signatures SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(signature.id)
        .run();
      try {
        await env.CALL_RECORDINGS_R2?.delete(signature.object_key);
      } catch {
        // The row is already revoked; a stale object is harmless.
      }
    }
    await env.DB.prepare("DELETE FROM verification_steps WHERE user_id = ? AND step = 'signature'")
      .bind(user.id)
      .run();
    return json({ ok: true, cleared: Boolean(signature) });
  }

  return json({ ok: false, error: "Method not allowed" }, 405);
}
