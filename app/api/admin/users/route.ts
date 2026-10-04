/**
 * User administration for the Chief DLAO.
 *
 * Role changes, disabling an account, and issuing a new voice PIN. Every one of them
 * writes to the audit trail with the before and after value, because "who was able to
 * do what last Tuesday" is unanswerable without the prior value recorded.
 *
 * Two things are deliberately not here. Nobody can edit or delete a user: an officer
 * who has left the district is disabled with a reason, not erased, because their
 * historic assignments and case notes still have to be attributable. And a caller
 * cannot promote themselves — `chief` is the only role that cannot be granted through
 * this endpoint, so administration cannot be handed to a new account and used to lock
 * the previous administrator out.
 */

import { NextResponse } from "next/server";
import { getAdminDatabase, requireSystemAdmin } from "@/lib/auth/admin-guard";
import { writeAudit, AUDIT_KINDS } from "@/lib/audit/log";
import { APP_ROLES, ROLE_DEFINITIONS, canonicalRole, isStaffRole } from "@/lib/auth/roles";
import { sha256Hex } from "@/lib/auth/hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const user = await requireSystemAdmin(request, db);
  if (user instanceof NextResponse) return user;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const only = url.searchParams.get("only") ?? "";

  const rows = await db
    .prepare(
      `SELECT u.id, u.display_name, u.phone, u.role, u.role_key, u.status, u.is_mock,
              u.verification_status, u.created_at,
              (SELECT COUNT(*) FROM cases c WHERE c.citizen_user_id = u.id) AS own_cases,
              (SELECT COUNT(*) FROM panel_assignments p WHERE p.citizen_user_id = u.id AND p.status='active') AS active_assignments
       FROM users u
       ${only === "staff" ? "WHERE u.role_key IS NOT NULL" : only === "citizen" ? "WHERE u.role = 'citizen'" : ""}
       ${q ? (only ? "AND" : "WHERE") + " (u.display_name LIKE ? OR u.phone LIKE ? OR u.id LIKE ?)" : ""}
       ORDER BY u.created_at DESC
       LIMIT 200`,
    )
    .bind(...(q ? [`%${q}%`, `%${q}%`, `%${q}%`] : []))
    .all<{
      id: string; display_name: string; phone: string | null; role: string; role_key: string | null;
      status: string | null; is_mock: number; verification_status: string | null; created_at: string;
      own_cases: number; active_assignments: number;
    }>();

  return NextResponse.json({
    ok: true,
    users: (rows.results ?? []).map((r) => ({
      id: r.id,
      name: r.display_name,
      phone: r.phone,
      role: canonicalRole(r.role_key ?? r.role) ?? r.role,
      rawRole: r.role_key ?? r.role,
      status: r.status ?? "active",
      isMock: r.is_mock === 1,
      verification: r.verification_status,
      createdAt: r.created_at,
      ownCases: Number(r.own_cases),
      activeAssignments: Number(r.active_assignments),
      titleBn: ROLE_DEFINITIONS.find((d) => d.key === canonicalRole(r.role_key ?? r.role))?.titleBn ?? r.role,
    })),
    assignableRoles: APP_ROLES.filter((r) => r !== "chief" && r !== "citizen").map((r) => ({
      key: r,
      titleBn: ROLE_DEFINITIONS.find((d) => d.key === r)?.titleBn ?? r,
    })),
  });
}

export async function PATCH(request: Request) {
  const db = getAdminDatabase();
  if (!db) return NextResponse.json({ ok: false, error: "ডেটাবেস সাময়িকভাবে উপল্লব্ধ নয়।" }, { status: 503 });
  const admin = await requireSystemAdmin(request, db);
  if (admin instanceof NextResponse) return admin;

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    role?: string;
    status?: string;
    newPin?: string;
    reason?: string;
  };
  if (!body.userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });

  const target = await db
    .prepare(`SELECT id, display_name, role, role_key, status FROM users WHERE id = ?`)
    .bind(body.userId)
    .first<{ id: string; display_name: string; role: string; role_key: string | null; status: string | null }>();
  if (!target) return NextResponse.json({ ok: false, error: "ব্যবহারকারী পাওয়া যায়নি" }, { status: 404 });

  // A caller cannot hand out or revoke the administrator role, so this endpoint can
  // never be used to escalate and then lock the previous administrator out.
  if ((body.role && canonicalRole(body.role) === "chief") || target.id === admin.id) {
    return NextResponse.json(
      { ok: false, error: "এই কাজটি সিস্টেম প্রশাসক নিজের জন্য করতে পারবেন না।" },
      { status: 403 },
    );
  }

  if (body.role) {
    const next = canonicalRole(body.role);
    if (!next || !isStaffRole(next)) {
      return NextResponse.json({ ok: false, error: "অবৈধ রোল" }, { status: 400 });
    }
    const before = target.role_key ?? target.role;
    await db
      .prepare(`UPDATE users SET role_key = ?, role = 'staff_seat' WHERE id = ?`)
      .bind(next, body.userId)
      .run();
    await writeAudit(db, {
      kind: AUDIT_KINDS.user_role_changed,
      refId: target.id,
      actorId: admin.id,
      actorRole: admin.role,
      detail: `${target.display_name}: ${before} → ${next}`,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, changed: "role", to: next });
  }

  if (body.status) {
    const next = body.status === "disabled" ? "disabled" : "active";
    if (next === (target.status ?? "active")) {
      return NextResponse.json({ ok: true, changed: "status", to: next });
    }
    await db.prepare(`UPDATE users SET status = ? WHERE id = ?`).bind(next, body.userId).run();
    await writeAudit(db, {
      kind: AUDIT_KINDS.user_status_changed,
      refId: target.id,
      actorId: admin.id,
      actorRole: admin.role,
      detail: `${target.display_name}: ${target.status ?? "active"} → ${next}`,
      // Disabling somebody is adverse, so a reason is mandatory rather than optional.
      reason: body.reason?.trim() || (next === "disabled" ? "কারণ উল্লেখ করা হয়নি" : null),
    });
    return NextResponse.json({ ok: true, changed: "status", to: next });
  }

  if (body.newPin) {
    const pin = String(body.newPin).replace(/\D/g, "");
    if (!/^[1-9]\d{3}$/.test(pin)) {
      return NextResponse.json({ ok: false, error: "৪ সংখ্যার পিন দিন, শুরুতে ০ থাকবে না।" }, { status: 400 });
    }
    await db
      .prepare(`UPDATE users SET pin_hash = ? WHERE id = ?`)
      .bind(await sha256Hex(pin), body.userId)
      .run();
    await writeAudit(db, {
      kind: AUDIT_KINDS.user_pin_reset,
      refId: target.id,
      actorId: admin.id,
      actorRole: admin.role,
      detail: `${target.display_name}-এর ভয়েস পিন নতুন করে দেওয়া হয়েছে`,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, changed: "pin" });
  }

  return NextResponse.json({ ok: false, error: "কোনো পরিবর্তন নির্দিষ্ট করা হয়নি" }, { status: 400 });
}
