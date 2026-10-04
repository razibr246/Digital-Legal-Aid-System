import {
  compareNames,
  detectDocumentType,
  isValidNid,
  isValidPassport,
  maskDocumentNumber,
  normalizeDigits,
  OCR_ENGINE,
  type DocumentType,
  type VerificationMethod,
  type VerificationStatus,
} from "@/lib/identity/identity";
import { runIdentityOcr } from "@/lib/identity/ocr";
import { simulateRegistryLookup, normalizeNidForLookup } from "@/lib/identity/lookup";
import { upsertStepStatement } from "@/lib/identity/steps";

type Json = Record<string, unknown>;

/** Minimal D1 surface used here, so this module adds no `any`. */
interface IdentityEnv {
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
  DEEPINFRA_API_KEY?: string;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function badRequest(message: string, extra: Json = {}): Response {
  return json({ ok: false, error: message, ...extra }, 400);
}

export async function handleVerifyIdentityRequest(
  request: Request,
  env: IdentityEnv,
  user: { id: string; displayName: string } | null,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const contentType = request.headers.get("content-type") || "";
  let method: VerificationMethod;
  let documentType: DocumentType | "unknown" = "unknown";
  let documentNumber: string | null = null;
  let ocrConfidence: number | null = null;
  let ocrRaw: string | null = null;
  let ocrModel: string | null = null;
  let nameEn: string | null = null;
  let nameBn: string | null = null;
  let fatherName: string | null = null;
  let motherName: string | null = null;
  let dateOfBirth: string | null = null;
  let address: string | null = null;
  let numberFormatOk = true;
  let numberNote: string | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      method = "photo";
      const formData = await request.formData();
      const file = formData.get("photo");
      const declaredType = String(formData.get("documentType") || "auto").trim();
      if (!file || typeof file === "string" || file.size === 0) {
        return badRequest("পত্রের ছবি আপলোড করা হয়নি");
      }
      if (file.size > 8 * 1024 * 1024) {
        return badRequest("ছবির আকার ৮ মেগাবাইটের বেশি হতে পারে");
      }
      const mimeType = file.type || "image/jpeg";
      if (!/^image\/(jpeg|png|webp)$/.test(mimeType)) {
        return badRequest("শুধুমাত্র JPEG, PNG বা WebP ছবি গ্রহণযোগ্য");
      }

      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const ocr = await runIdentityOcr(env.DEEPINFRA_API_KEY || "", base64, mimeType);
      if (ocr.error) {
        return json({ ok: false, error: ocr.error, stage: "ocr" }, 502);
      }
      const extraction = ocr.extraction;
      if (!extraction) {
        return json({ ok: false, error: "ছবি থেকে তথ্য পড়া যায়নি", stage: "extract" }, 422);
      }
      if (!extraction.isReadable) {
        return json(
          {
            ok: false,
            error: "ছবিটি স্পষ্ট নয়। পত্রটি ফ্রেমের ভেতরে সমতলে ধরে আবার ছবি তুলুন।",
            stage: "unreadable",
          },
          422,
        );
      }

      documentType =
        declaredType === "auto" ? extraction.documentType : (declaredType as DocumentType);
      documentNumber = extraction.documentNumber ? normalizeDigits(extraction.documentNumber) : null;
      nameEn = extraction.nameEn;
      nameBn = extraction.nameBn;
      fatherName = extraction.fatherName;
      motherName = extraction.motherName;
      dateOfBirth = extraction.dateOfBirth;
      address = extraction.address;
      ocrConfidence = extraction.confidence;
      ocrRaw = ocr.raw;
      ocrModel = ocr.model;
    } else {
      method = "number";
      const body = (await request.json().catch(() => ({}))) as Json;
      const rawNumber = String(body.documentNumber || "").trim();
      const requested = String(body.documentType || "auto").trim();
      if (!rawNumber) return badRequest("পত্রের নম্বর দিন");

      documentType = requested === "auto" ? detectDocumentType(rawNumber) : (requested as DocumentType);
      if (documentType === "unknown") {
        return badRequest(
          "পত্রের নম্বর সঠিক নয়। জাতীয় পরিচয়পত্রে ১০, ১৩ বা ১৭ সংখ্যা, পাসপোর্টে ১-২ অক্ষর ও ৭-৯ সংখ্যা থাকে।",
        );
      }
      documentNumber = documentType === "nid" ? normalizeDigits(rawNumber) : rawNumber.toUpperCase();
      if (documentType === "nid" && !isValidNid(documentNumber)) {
        return badRequest("জাতীয় পরিচয়পত্র নম্বরে ১০, ১৩ বা ১৭ সংখ্যা থাকতে হবে");
      }
      if (documentType === "passport" && !isValidPassport(documentNumber)) {
        return badRequest("পাসপোর্ট নম্বরে ১-২ অক্ষর এবং ৭-৯ সংখ্যা থাকতে হবে");
      }
      // Only length/format is checked. BD NID check-digit algorithms differ
      // between sources, and this lookup is simulated, so enforcing one would
      // reject genuinely valid numbers. A real registry call must validate.
    }

    if (!documentNumber) {
      return badRequest("পত্রের নম্বরটি ছবি থেকে পড়া যায়নি। আরেকবার ছবি তুলুন।", { stage: "document_number" });
    }
    if (documentType === "unknown") {
      return badRequest("পত্রের ধরন (জাতীয় পরিচয়পত্র না পাসপোর্ট) শনাক্ত করা যায়নি।", {
        stage: "document_type",
      });
    }

    // Number lookups resolve against the simulated registry; photo lookups keep
    // what the OCR read and cross-check the number format.
    if (method === "number") {
      const record = simulateRegistryLookup(documentType, normalizeNidForLookup(documentNumber));
      nameEn = record.nameEn;
      nameBn = record.nameBn;
      fatherName = record.fatherName;
      motherName = record.motherName;
      dateOfBirth = record.dateOfBirth;
      address = record.address;
      ocrConfidence = record.confidence;
    } else {
      const detected = detectDocumentType(documentNumber);
      if (detected !== "unknown" && detected !== documentType) {
        return badRequest(
          `ছবিতে ${documentType === "nid" ? "পাসপোর্ট" : "জাতীয় পরিচয়পত্র"}-এর মতো নম্বর পড়া যাচ্ছে, কিন্তু আপনি ${documentType} নির্বাচন করেছেন।`,
          { stage: "document_type_mismatch" },
        );
      }
      // OCR can miscount digits, so a malformed number is not rejected outright;
      // it is forced into manual review instead.
      numberFormatOk =
        documentType === "nid" ? isValidNid(documentNumber) : isValidPassport(documentNumber);
      if (!numberFormatOk) {
        numberNote = documentType === "nid"
          ? "ছবি থেকে পড়া নম্বরটি ১০, ১৩ বা ১৭ সংখ্যার নয় — যাচাই করা হয়নি।"
          : "ছবি থেকে পড়া পাসপোর্ট নম্বরটি সঠিক ফরম্যাটে নয় — যাচাই করা হয়নি।";
      }
    }

    const nameComparison = compareNames(user.displayName, [nameEn, nameBn]);
    const status: VerificationStatus = nameComparison.match && numberFormatOk ? "verified" : "review";
    if (numberNote && !nameComparison.detail) {
      nameComparison.detail = numberNote;
    }
    const verificationId = `IDV-${crypto.randomUUID()}`;

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO identity_verifications
          (id, user_id, method, document_type, document_number, document_number_masked,
           name_en, name_bn, father_name, mother_name, date_of_birth, address, ocr_confidence,
           ocr_engine, ocr_model, ocr_raw, source, simulated, status, name_match, name_mismatch_detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'simulated', 1, ?, ?, ?)`,
      ).bind(
        verificationId,
        user.id,
        method,
        documentType,
        documentNumber,
        maskDocumentNumber(documentNumber),
        nameEn,
        nameBn,
        fatherName,
        motherName,
        dateOfBirth,
        address,
        ocrConfidence,
        method === "photo" ? OCR_ENGINE : null,
        ocrModel,
        ocrRaw,
        status,
        nameComparison.match ? 1 : 0,
        nameComparison.detail || null,
      ),
      // A clean match verifies the account; a mismatch only flags it for review.
      env.DB.prepare("UPDATE users SET verification_status = ? WHERE id = ?").bind(
        status === "verified" ? "verified" : "pending",
        user.id,
      ),
      // Task 1 of the journey: the document check is done.
      upsertStepStatement(
        env,
        user.id,
        "document",
        {
          verificationId,
          documentType,
          documentNumberMasked: maskDocumentNumber(documentNumber),
          status,
          method,
        },
        "self_service",
      ),
    ]);

    // The document is authoritative: once a NID/passport is supplied, the
    // profile name follows it automatically.
    const documentName = (nameBn || nameEn || "").trim();
    let nameUpdatedFromDocument = false;
    if (documentName) {
      await env.DB.prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(documentName, user.id)
        .run();
      nameUpdatedFromDocument = documentName !== user.displayName.trim();
    }

    return json({
      ok: true,
      verification: {
        id: verificationId,
        method,
        documentType,
        documentNumberMasked: maskDocumentNumber(documentNumber),
        nameEn,
        nameBn,
        fatherName,
        motherName,
        dateOfBirth,
        address,
        ocrConfidence,
        documentNumber,
        ocrEngine: method === "photo" ? OCR_ENGINE : null,
        ocrModel,
        source: "simulated",
        simulated: true,
        status,
        nameMatch: nameComparison.match,
        nameUpdatedFromDocument,
        profileName: documentName || user.displayName,
        documentNumberValid: numberFormatOk,
        nameMismatchDetail: nameComparison.detail || null,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

export async function handleIdentityVerificationsListRequest(
  request: Request,
  env: IdentityEnv,
  user: { id: string } | null,
): Promise<Response> {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const { results } = await env.DB.prepare(
    `SELECT id, method, document_type, document_number, document_number_masked, name_en, name_bn,
            father_name, mother_name, date_of_birth, address, ocr_confidence, ocr_engine, ocr_model,
            source, simulated, status, name_match, name_mismatch_detail, created_at,
            accepted_at, accepted_display_name
     FROM identity_verifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 10`,
  )
    .bind(user.id)
    .all();

  return json({ ok: true, verifications: results ?? [] });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Records the citizen's sign-off on a verification result. Until this runs the
 * record stays a proposal, so an unreadable or misread document can never make
 * an account "verified" on its own.
 */
export async function handleAcceptVerificationRequest(
  request: Request,
  env: IdentityEnv,
  user: { id: string; displayName: string } | null,
): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.DB) return json({ ok: false, error: "Database unavailable" }, 503);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  try {
    const body = (await request.json().catch(() => ({}))) as Json;
    const verificationId = String(body.verificationId || "").trim();
    const displayName = String(body.displayName || "").trim().slice(0, 120);
    if (!verificationId) return badRequest("verificationId প্রয়োজন");

    const record = await env.DB.prepare(
      "SELECT id, status, name_match FROM identity_verifications WHERE id = ? AND user_id = ? LIMIT 1",
    )
      .bind(verificationId, user.id)
      .all<{ id: string; status: string; name_match: number | null }>();

    const row = record.results?.[0];
    if (!row) return badRequest("যাচাইয়ের রেকর্ড পাওয়া যায়নি");

    const now = new Date().toISOString();
    const statements = [
      env.DB.prepare(
        `UPDATE identity_verifications
         SET accepted_at = ?, accepted_display_name = ?
         WHERE id = ? AND user_id = ?`,
      ).bind(now, displayName || null, verificationId, user.id),
    ];

    // A clean match may mark the account verified; a mismatch stays pending.
    const status = row.name_match === 1 ? "verified" : "pending";
    statements.push(
      env.DB.prepare("UPDATE users SET verification_status = ? WHERE id = ?").bind(status, user.id),
    );
    if (displayName && displayName !== user.displayName) {
      statements.push(
        env.DB.prepare("UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(
          displayName,
          user.id,
        ),
      );
    }

    await env.DB.batch(statements);

    return json({
      ok: true,
      acceptedAt: now,
      verificationStatus: status,
      displayName: displayName || user.displayName,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
}
