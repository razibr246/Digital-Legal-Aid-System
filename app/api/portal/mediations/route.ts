import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getD1SessionUser, type D1Database } from "@/lib/auth/d1-session";
import { getLocalSessionUser } from "@/lib/auth/local-session";
import type { SessionUser } from "@/lib/auth/roles";
import { writeAudit } from "@/lib/audit/log";
import { DEFAULT_MANDATORY_DISTRICTS, certificationState } from "@/lib/case/domain";
import {
  bookingVerdict,
  isDateKey,
  validateBookingDate,
  type MediationOutcome,
} from "@/lib/case/mediation";
import { draftSettlement, renderSettlementText } from "@/lib/case/settlement-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ADR / mediation.
 *
 * `mediations` and `mediator_requests` have existed since migration 0016 with every
 * column this needs, and nothing ever wrote to them. This route is the first writer, so
 * the shape of the schema is doing exactly the job 0016 designed it for: one row per
 * attempt (repeatable), and the lawyer gate reads the LAST outcome — which is what
 * separates `medLate` from `needFailedMed`.
 *
 * Deliberately NOT in worker-entry.ts's intercept table, so one implementation runs
 * under both the Worker and `next dev`.
 *
 * The important behaviour is the gate. `assignPanelLawyer` moves a case to `lawyer`
 * without consulting `caseActionState`, so the mandatory-mediation rule was documented
 * and unenforced. POST /books only after `bookingVerdict` agrees, which means the
 * mandatory districts, the appellate/labour carve-out and the already-settled case are
 * all refused server-side rather than hidden by a disabled button.
 */

function getToken(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split("; ")
    .find((row) => row.startsWith("auth_session="))
    ?.split("=")[1];
}

function getDatabase(): D1Database | null {
  try {
    return (getCloudflareContext() as unknown as { env?: { DB?: D1Database } }).env?.DB ?? null;
  } catch {
    return null;
  }
}

async function getRequestUser(request: Request, db: D1Database | null): Promise<SessionUser | null> {
  const token = getToken(request);
  return (await getD1SessionUser(db, token)) || getLocalSessionUser(token);
}

/** DLAO-family roles. Mediation is a district-officer action, not a citizen one. */
function isDistrictOfficer(role: string): boolean {
  return ["dlao", "dlao_officer", "chief", "chief_legal_aid_officer", "metropolitan_legal_aid_officer", "paralegal"].includes(role);
}

interface CaseFactsRow {
  id: string;
  docket_id: string;
  status: string;
  stage: string | null;
  district_code: string | null;
  category: string | null;
  problem_category: string | null;
  lawyer_requested: number;
  eligibility_passed: number | null;
  lawyer_assigned: number;
}

const CASE_FACTS_SELECT = `
  SELECT c.id, c.docket_id, c.status, c.stage, c.district_code, c.category,
         c.problem_category, c.lawyer_requested, c.eligibility_passed,
         CASE WHEN EXISTS (
           SELECT 1 FROM panel_assignments pa
           WHERE pa.case_id = c.id AND pa.status = 'active'
         ) THEN 1 ELSE 0 END AS lawyer_assigned
    FROM cases c
`;

async function loadCaseFacts(db: D1Database, caseId: string) {
  const row = await db
    .prepare(`${CASE_FACTS_SELECT} WHERE c.id = ?`)
    .bind(caseId)
    .first<CaseFactsRow>();
  if (!row) return null;

  const attempts = await db
    .prepare(
      `SELECT scheduled_at, outcome FROM mediations
        WHERE case_id = ? ORDER BY at ASC, id ASC`,
    )
    .bind(caseId)
    .all<{ scheduled_at: string | null; outcome: string | null }>();

  return { ...row, mediations: attempts.results ?? [] };
}

/* ------------------------------------------------------------------ GET */

export async function GET(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isDistrictOfficer(user.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const url = new URL(request.url);
    const caseId = url.searchParams.get("caseId");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    // One case's ADR history, newest first — drives the booking panel's "attempts so far".
    if (caseId) {
      const facts = await loadCaseFacts(db, caseId);
      if (!facts) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });
      const history = await db
        .prepare(
          `SELECT m.id, m.scheduled_at, m.venue, m.outcome, m.notes, m.mediator_name,
                  m.held_by_officer, m.at
             FROM mediations m WHERE m.case_id = ?
            ORDER BY m.at DESC, m.id DESC`,
        )
        .bind(caseId)
        .all();
      const requests = await db
        .prepare(
          `SELECT id, mediator_name, status, when_at, reason, decided_at
             FROM mediator_requests WHERE case_id = ? ORDER BY when_at DESC`,
        )
        .bind(caseId)
        .all();
      const settlement = await db
        .prepare(
          `SELECT signed_applicant, signed_opposite, signed_mediator, certified, decree
             FROM settlements WHERE case_id = ?`,
        )
        .bind(caseId)
        .first();

      return NextResponse.json({
        ok: true,
        case: {
          id: facts.id,
          docketId: facts.docket_id,
          status: facts.status,
          stage: facts.stage,
          districtCode: facts.district_code,
          mediationAllowed: bookingVerdict(facts, DEFAULT_MANDATORY_DISTRICTS),
          assignLawyerAllowed: null,
        },
        history: history.results ?? [],
        mediatorRequests: requests.results ?? [],
        settlement: settlement ?? null,
        // The stored draft, rebuilt from the record, so the print view and the booking
        // panel show byte-identical text. `decree` is the archived copy; this is the
        // structured form with clause ids and sources that the UI can lay out.
        draft: await buildDraftForCase(db, caseId),
      });
    }

    // The cause list. Bounded to a window so the calendar cannot ask for the whole table.
    const rows = await db
      .prepare(
        `SELECT m.id, m.case_id, m.scheduled_at, m.venue, m.outcome, m.notes,
                m.mediator_name, m.mediator_user_id, m.held_by_officer, m.at,
                c.docket_id, c.problem, c.district, c.status, c.stage,
                a.applicant_name
           FROM mediations m
           JOIN cases c ON c.id = m.case_id
           LEFT JOIN applications a ON a.case_id = c.id
          WHERE (? IS NULL OR date(m.scheduled_at) >= date(?))
            AND (? IS NULL OR date(m.scheduled_at) <= date(?))
          ORDER BY m.scheduled_at ASC`,
      )
      .bind(from, from, to, to)
      .all<{
        id: string; case_id: string; scheduled_at: string | null; venue: string | null;
        outcome: string | null; notes: string | null; mediator_name: string | null;
        mediator_user_id: string | null; held_by_officer: string | null; at: string;
        docket_id: string; problem: string; district: string | null; status: string;
        stage: string | null; applicant_name: string | null;
      }>();

    // Undated attempts still matter — a `settled` row with no scheduled_at is the
    // evidence the lawyer gate reads, so it must not vanish just because it has no date.
    const undated = await db
      .prepare(
        `SELECT m.id, m.case_id, m.scheduled_at, m.venue, m.outcome, m.notes,
                m.mediator_name, m.held_by_officer, m.at,
                c.docket_id, c.problem, c.district, c.status, c.stage,
                a.applicant_name
           FROM mediations m
           JOIN cases c ON c.id = m.case_id
           LEFT JOIN applications a ON a.case_id = c.id
          WHERE m.scheduled_at IS NULL
          ORDER BY m.at DESC`,
      )
      .all<Record<string, unknown>>();

    const mediators = await db
      .prepare(
        `SELECT id, name_bn AS name, specialisations, jurisdiction_district_name AS district
           FROM panel_lawyers
          WHERE kind = 'mediator' AND list_status = 'on_panel'
          ORDER BY name_bn ASC`,
      )
      .all();

    return NextResponse.json({
      ok: true,
      mediations: rows.results ?? [],
      undated: undated.results ?? [],
      mediators: mediators.results ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ POST: book */

export async function POST(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isDistrictOfficer(user.role)) {
      return NextResponse.json({ ok: false, error: "শুধুমাত্র জেলা কর্মকর্তা মধ্যস্থতা নির্ধারণ করতে পারবেন।" }, { status: 403 });
    }
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as {
      caseId?: string;
      date?: string;
      time?: string;
      venue?: string;
      mediatorId?: string | null;
      mediatorName?: string | null;
      notes?: string;
    };

    const caseId = String(body.caseId || "").trim();
    if (!caseId) return NextResponse.json({ ok: false, error: "caseId required" }, { status: 400 });

    // Combine date + time into one ISO instant, stored in `scheduled_at`.
    const dateKey = String(body.date || "").trim();
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.time || "")) ? String(body.time) : "10:00";
    if (!isDateKey(dateKey)) {
      return NextResponse.json({ ok: false, error: "সঠিক তারিখ দিন।" }, { status: 400 });
    }
    const dateCheck = validateBookingDate(dateKey);
    if (!dateCheck.ok) return NextResponse.json({ ok: false, error: dateCheck.error }, { status: 400 });
    const scheduledAt = new Date(`${dateKey}T${time}:00`);

    const facts = await loadCaseFacts(db, caseId);
    if (!facts) return NextResponse.json({ ok: false, error: "Case not found" }, { status: 404 });

    // THE GATE. Ask the shared rules, do not re-derive them.
    const verdict = bookingVerdict(facts, DEFAULT_MANDATORY_DISTRICTS);
    if (!verdict.ok) {
      return NextResponse.json(
        { ok: false, error: verdict.noteBn || "এই কেসে মধ্যস্থতা নির্ধারণ করা যাবে না।", reason: verdict.reason },
        { status: 409 },
      );
    }

    // A mediator must be a real, on-panel mediator. The honouraria rule depends on it.
    let mediatorName = String(body.mediatorName || "").trim() || null;
    if (body.mediatorId) {
      const mediator = await db
        .prepare(
          `SELECT id, name_bn, list_status, kind FROM panel_lawyers WHERE id = ?`,
        )
        .bind(String(body.mediatorId))
        .first<{ id: string; name_bn: string | null; list_status: string; kind: string }>();
      if (!mediator || mediator.kind !== "mediator") {
        return NextResponse.json({ ok: false, error: "নির্বাচিত ব্যক্তি মধ্যস্থতাকারী নন।" }, { status: 400 });
      }
      if (mediator.list_status !== "on_panel") {
        return NextResponse.json({ ok: false, error: "এই মধ্যস্থতাকারীর তালিকাভুক্ত অবস্থা নেই।" }, { status: 400 });
      }
      mediatorName = mediator.name_bn;
    }

    const mediationId = `MED-${crypto.randomUUID()}`;
    const venue = String(body.venue || "").trim() || "জেলা লিগ্যাল এইড অফিস, সালিস কক্ষ";
    const previousStage = facts.stage ?? facts.status;

    await db.batch([
      db
        .prepare(
          `INSERT INTO mediations
             (id, case_id, scheduled_at, held_by_officer, mediator_user_id, mediator_name, venue, outcome, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
        )
        .bind(
          mediationId,
          caseId,
          scheduledAt.toISOString(),
          user.displayName,
          body.mediatorId ? String(body.mediatorId) : null,
          mediatorName,
          venue,
          String(body.notes || "").trim() || null,
        ),

      // Stage moves with the booking, so the queue and the citizen view agree that this
      // case is now sitting in mediation rather than still waiting for triage.
      db
        .prepare(
          `UPDATE cases SET stage = 'mediation', stage_changed_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
        )
        .bind(caseId),

      db
        .prepare(
          `INSERT INTO case_stage_history
             (id, case_id, from_stage, to_stage, changed_by, changed_by_role, note, at)
           VALUES (?, ?, ?, 'mediation', ?, 'dlao', ?, CURRENT_TIMESTAMP)`,
        )
        .bind(
          `CSH-${crypto.randomUUID()}`,
          caseId,
          previousStage,
          user.displayName,
          `মধ্যস্থতা নির্ধারিত — ${venue}`,
        ),

      // A Special Mediator must accept before honouraria are billable, so the request
      // is its own record rather than a flag on the case. Seeded as `pending` and only
      // meaningful when a mediator was actually named.
      ...(body.mediatorId
        ? [
            db
              .prepare(
                `INSERT INTO mediator_requests
                   (id, case_id, mediator_user_id, mediator_name, requested_by, requested_by_role, when_at, status, reason)
                 VALUES (?, ?, ?, ?, ?, 'dlao', ?, 'pending', ?)`,
              )
              .bind(
                `MREQ-${crypto.randomUUID()}`,
                caseId,
                String(body.mediatorId),
                mediatorName,
                user.displayName,
                scheduledAt.toISOString(),
                `মধ্যস্থতা নির্ধারিত: ${scheduledAt.toISOString()}`,
              ),
          ]
        : []),
    ]);

    await writeAudit(db, {
      kind: "mediation.scheduled",
      refId: caseId,
      actorId: user.id,
      actorRole: user.role,
      detail: `${facts.docket_id} — মধ্যস্থতা নির্ধারিত ${dateKey} ${time}, স্থান: ${venue}`,
    });
    await writeAudit(db, {
      kind: "case.stage_changed",
      refId: caseId,
      actorId: user.id,
      actorRole: user.role,
      detail: `${previousStage} → mediation`,
      reason: "ADR booking",
    });

    return NextResponse.json({
      ok: true,
      mediation: { id: mediationId, caseId, scheduledAt: scheduledAt.toISOString(), venue, mediatorName },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Loads everything the drafter is allowed to use, and nothing else.
 *
 * The opposite party is NOT in here, because the record does not contain it: a survivor
 * describes her own situation and has not supplied the other side's details. The drafter
 * therefore cannot name them, which is the point.
 */
async function buildDraftForCase(db: D1Database, caseId: string, mediationId?: string | null) {
  // `mediationId` is passed when drafting during a settle, because at that moment the
  // outcome has NOT been written yet. Selecting by `outcome = 'settled'` there found
  // nothing, so the venue, mediator and mediation date all came back null and the
  // agreement opened clauses the record could actually have filled. Passing the row in
  // removes the ordering dependency entirely.
  const mediationJoin = mediationId
    ? "LEFT JOIN mediations m ON m.id = ?"
    : `LEFT JOIN mediations m ON m.id = (
         SELECT id FROM mediations WHERE case_id = c.id AND outcome = 'settled'
          ORDER BY at DESC, id DESC LIMIT 1
       )`;

  const row = await db
    .prepare(
      `SELECT c.docket_id, c.problem, c.district, a.applicant_name,
              m.id AS mediation_id, m.venue, m.notes, m.mediator_name,
              m.scheduled_at, m.at
         FROM cases c
         LEFT JOIN applications a ON a.case_id = c.id
         ${mediationJoin}
        WHERE c.id = ?`,
    )
    .bind(...(mediationId ? [mediationId, caseId] : [caseId]))
    .first<{
      docket_id: string; problem: string; district: string | null; applicant_name: string | null;
      mediation_id: string | null; venue: string | null; notes: string | null;
      mediator_name: string | null; scheduled_at: string | null; at: string | null;
    }>();

  if (!row) throw new Error("Case not found while drafting the settlement");

  // `mediations` has no `settled_at` column — the schema gives `scheduled_at` (when the
  // sitting was) and `at` (when the row was written). The agreement must date the
  // MEDIATION, not the moment the officer clicked the button, so `scheduled_at` is the
  // right source and `at` is only the fallback for a row booked without a date.
  const occurredAt = row.scheduled_at ?? row.at;

  return draftSettlement({
    docketId: row.docket_id,
    problem: row.problem,
    district: row.district,
    applicantName: row.applicant_name,
    mediatorName: row.mediator_name,
    venue: row.venue,
    notes: row.notes,
    settledAt: occurredAt,
    outcome: "settled",
  });
}

/* ------------------------------------------------------------------ PATCH: outcome */

export async function PATCH(request: Request) {
  try {
    const db = getDatabase();
    const user = await getRequestUser(request, db);
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    if (!isDistrictOfficer(user.role)) {
      return NextResponse.json({ ok: false, error: "শুধুমাত্র জেলা কর্মকর্তা ফলাফল নথিভুক্ত করতে পারবেন।" }, { status: 403 });
    }
    if (!db) return NextResponse.json({ ok: false, error: "DB not found" }, { status: 500 });

    const body = (await request.json().catch(() => ({}))) as {
      mediationId?: string;
      outcome?: MediationOutcome;
      notes?: string;
      venue?: string;
      /** Which party is signing the settlement. */
      sign?: "applicant" | "opposite" | "mediator";
      caseId?: string;
      mediatorRequestId?: string;
      status?: string;
    };

    /* ---- settlement signature ----
       One party at a time. `certificationState` in domain.ts already refuses to certify
       until all three are set, so this can only ever move a single bit — one click can
       never certify a settlement on its own. */
    if (body.sign && body.caseId) {
      const column =
        body.sign === "applicant" ? "signed_applicant"
        : body.sign === "opposite" ? "signed_opposite"
        : "signed_mediator";
      const caseId = String(body.caseId);
      await db
        .prepare(
          `INSERT OR IGNORE INTO settlements (case_id, signed_applicant, signed_mediator, certified)
           VALUES (?, 0, 0, 0)`,
        )
        .bind(caseId)
        .run();
      // The opposite party's slot is a TEXT column carrying WHO signed and WHEN, unlike
      // the two bit flags. Recording a bare 1 there would lose the audit trail.
      const value = body.sign === "opposite" ? `opposite:${new Date().toISOString()}` : 1;
      await db
        .prepare(`UPDATE settlements SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE case_id = ?`)
        .bind(value, caseId)
        .run();
      await writeAudit(db, {
        kind: "settlement.signed",
        refId: caseId,
        actorId: user.id,
        actorRole: user.role,
        detail: `${body.sign} স্বাক্ষর করেছেন`,
      });
      const after = await db
        .prepare(
          `SELECT signed_applicant AS a, signed_opposite AS b, signed_mediator AS c, certified AS d
             FROM settlements WHERE case_id = ?`,
        )
        .bind(caseId)
        .first<{ a: number; b: string | null; c: number; d: number }>();
      return NextResponse.json({
        ok: true,
        signed: body.sign,
        // Reuse the shared rule so this panel never disagrees with the Chief's certify button.
        state: certificationState(!!after?.a, !!after?.b, !!after?.c, !!after?.d),
      });
    }

    // The mediator's own accept/decline, which gates the honouraria.
    if (body.mediatorRequestId && body.status) {
      const status = String(body.status);
      if (!["accepted", "declined"].includes(status)) {
        return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
      }
      await db
        .prepare(
          `UPDATE mediator_requests SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?`,
        )
        .bind(status, String(body.mediatorRequestId))
        .run();
      await writeAudit(db, {
        kind: "mediation.scheduled",
        refId: String(body.caseId || ""),
        actorId: user.id,
        actorRole: user.role,
        detail: `মধ্যস্থতাকারী ${status === "accepted" ? "গ্রহণ করেছেন" : "প্রত্যাখ্যান করেছেন"}`,
      });
      return NextResponse.json({ ok: true });
    }

    const mediationId = String(body.mediationId || "").trim();
    if (!mediationId) return NextResponse.json({ ok: false, error: "mediationId required" }, { status: 400 });

    const existing = await db
      .prepare(`SELECT id, case_id, outcome FROM mediations WHERE id = ?`)
      .bind(mediationId)
      .first<{ id: string; case_id: string; outcome: string | null }>();
    if (!existing) return NextResponse.json({ ok: false, error: "Mediation not found" }, { status: 404 });

    const notes = body.notes !== undefined ? String(body.notes).trim() : undefined;
    const venue = body.venue !== undefined ? String(body.venue).trim() : undefined;

    if (body.outcome) {
      const outcome = body.outcome;
      if (!["settled", "failed"].includes(outcome)) {
        return NextResponse.json(
          { ok: false, error: "ফলাফল 'settled' বা 'failed' হতে হবে।" },
          { status: 400 },
        );
      }
      // A settlement opens the three-party signing record. The Chief certifies only when
      // all three have signed (certificationState in domain.ts), and the third party is
      // the mediator — so the row has to exist the moment mediation succeeds, or the
      // Chief console has nothing to certify.
      if (outcome === "settled") {
        // The AI drafts the agreement from the record. It is stored as a DRAFT in
        // `decree` and deliberately left incomplete: clauses with no source stay open
        // rather than being filled in, because a settlement is an enforceable instrument
        // and an invented term would manufacture a dispute. `readyToSign` is reported back
        // so the UI can say what is missing instead of implying the document is finished.
        //
        // Built BEFORE any write, deliberately. The previous order updated the outcome
        // first, so a failure here left a case recorded as settled with no settlement row
        // and no draft — a half-finished legal instrument. Drafting is pure and read-only,
        // so doing it first makes the write below all-or-nothing in practice.
        const draft = await buildDraftForCase(db, existing.case_id, mediationId);
        const text = renderSettlementText(draft);

        await db.batch([
          db
            .prepare(
              `UPDATE mediations SET outcome = ?, notes = COALESCE(?, notes), venue = COALESCE(?, venue)
                WHERE id = ?`,
            )
            .bind(outcome, notes ?? null, venue ?? null, mediationId),
          db
            .prepare(
              `INSERT OR IGNORE INTO settlements (case_id, signed_applicant, signed_mediator, certified, decree)
               VALUES (?, 0, 0, 0, ?)`,
            )
            .bind(existing.case_id, text),
          db
            .prepare(
              `UPDATE cases SET stage = 'settled', stage_changed_at = CURRENT_TIMESTAMP,
                                 updated_at = CURRENT_TIMESTAMP
                WHERE id = ?`,
            )
            .bind(existing.case_id),
        ]);

        await writeAudit(db, {
          kind: "settlement.drafted",
          refId: existing.case_id,
          actorId: user.id,
          actorRole: user.role,
          detail: `সালিশ সনদ প্রস্তুত — ${draft.openClauseIds.length}টি অংশ অনির্ধারিত`,
          reason: "Drafted from the case record; open clauses were not filled in",
        });
        return NextResponse.json({ ok: true, outcome, draft, textBn: text });
      }

      await db
        .prepare(
          `UPDATE mediations SET outcome = ?, notes = COALESCE(?, notes), venue = COALESCE(?, venue)
            WHERE id = ?`,
        )
        .bind(outcome, notes ?? null, venue ?? null, mediationId)
        .run();

      // A failed attempt does not settle the case; it releases the lawyer gate with
      // `needFailedMed`, which needs the applicant to have asked for a lawyer.
      await db
        .prepare(
          `UPDATE cases SET stage = 'review', stage_changed_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND stage = 'mediation'`,
        )
        .bind(existing.case_id)
        .run();

      await writeAudit(db, {
        kind: "mediation.scheduled",
        refId: existing.case_id,
        actorId: user.id,
        actorRole: user.role,
        detail: "মধ্যস্থতা ফলাফল: ব্যর্থ",
        reason: notes || null,
      });

      // There is deliberately no client-supplied `decree` path.
      //
      // An earlier version accepted `body.decree` and wrote it into `settlements.decree`,
      // which let any caller replace an enforceable settlement agreement with arbitrary
      // text and bypass the drafter's guarantee that every clause traces to the case
      // record. `settlements.decree` is now only ever written by the drafter, or by the
      // Chief's certification flow.
    } else {
      const sets: string[] = [];
      const binds: unknown[] = [];
      if (notes !== undefined) { sets.push("notes = ?"); binds.push(notes || null); }
      if (venue !== undefined) { sets.push("venue = ?"); binds.push(venue); }
      if (!sets.length) return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
      binds.push(mediationId);
      await db.prepare(`UPDATE mediations SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
