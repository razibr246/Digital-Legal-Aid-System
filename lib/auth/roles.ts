/**
 * Role registry.
 *
 * The canonical keys are the short ones from the DBLA role table (dlao, chief,
 * chairman, …). The previous longer keys are kept as *legacy aliases* rather than
 * removed: they are still stored in `users.role` for rows created before this
 * change, and ~27 call sites still compare against them, so dropping them would
 * break every one of those comparisons at once.
 *
 * `RoleGroup` exists so the login screen never shows fifteen buttons at once —
 * the picker is two steps: pick a group, then pick a role inside it.
 */

export type RoleGroupId = "district" | "courts" | "national" | "partner";

export interface RoleGroup {
  id: RoleGroupId;
  titleBn: string;
  titleEn: string;
  blurbBn: string;
  blurbEn: string;
}

export const ROLE_GROUPS: RoleGroup[] = [
  {
    id: "district",
    titleBn: "জেলা কার্যালয়",
    titleEn: "District office",
    blurbBn: "জেলা লিগ্যাল এইড কমিটি ও জেলা কার্যালয়",
    blurbEn: "District legal aid committee and office",
  },
  {
    id: "courts",
    titleBn: "আদালত ও আইনি প্রতিষ্ঠান",
    titleEn: "Courts & tribunals",
    blurbBn: "আদালতে বসবেন এমন কর্মকর্তা ও প্যানেল আইনজীবী",
    blurbEn: "Court-side officers and panel counsel",
  },
  {
    id: "national",
    titleBn: "জাতীয় ও প্রশাসন",
    titleEn: "National & administration",
    blurbBn: "জাতীয় পর্যায়ে কনফিগারেশন ও হেল্পলাইন",
    blurbEn: "National configuration and the helpline",
  },
  {
    id: "partner",
    titleBn: "অংশীদার ও সহায়তা পাঠানো",
    titleEn: "Partners & assisted filing",
    blurbBn: "রেফারেল ও ডিজিটাল সেবা কেন্দ্র",
    blurbEn: "Referral and digital service centres",
  },
];

export interface RoleDefinition {
  key: string;
  titleBn: string;
  titleEn: string;
  scopeBn: string;
  scopeEn: string;
  group: RoleGroupId;
  /** Superseded keys that mean the same thing. Kept working, hidden from the picker. */
  legacyKeys?: string[];
  /** Short parenthetical shown next to the title in the login picker only. */
  loginAnnotationBn?: string;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  // ---- District office
  // Chief is listed before the plain DLAO: it is the supervisory/admin seat, so
  // it belongs at the top of the picker rather than in the array's alphabetical
  // fall-through order.
  {
    key: "chief",
    titleBn: "চীফ লিগ্যাল এইড অফিসার",
    titleEn: "Chief Legal Aid Officer",
    scopeBn: "একটি জেলা — সালিশ অনুমোদন, পরিশোধ, লিগ্যাল এইড অফিসার তদারকি",
    scopeEn: "One district — certifies settlements, approves payments, supervises DLAOs",
    group: "district",
    // "cdlao" is the abbreviation officers actually use for the Chief DLAO, and it
    // is what staff type when they mean this role.
    legacyKeys: ["chief_legal_aid_officer", "cdlao"],
    loginAnnotationBn: "Admin",
  },
  {
    key: "dlao",
    titleBn: "লিগ্যাল এইড অফিসার",
    titleEn: "Legal Aid Officer",
    scopeBn: "একটি জেলা কার্যালয় — দৈনন্দিন মামলা কাজ",
    scopeEn: "One district office — day-to-day case work",
    group: "district",
    legacyKeys: ["dlao_officer"],
    loginAnnotationBn: "dlao",
  },
  {
    key: "chairman",
    titleBn: "জেলা কমিটির চেয়ারম্যান",
    titleEn: "District Committee Chairman",
    scopeBn: "প্যানেল তালিকা পরিবর্তন অনুমোদন ও ভ্রষ্টামূলক মামলা নিষ্পত্তি",
    scopeEn: "Approves panel list changes and settles misconduct cases",
    group: "district",
  },
  {
    key: "chowki",
    titleBn: "চৌকি আদালতের লিগ্যাল এইড অফিসার",
    titleEn: "Legal Aid Officer — Chowki Adalat",
    scopeBn: "সার্কিট আদালত কার্যালয়",
    scopeEn: "Circuit-court office",
    group: "courts",
  },
  {
    key: "sclao",
    titleBn: "সুপ্রীম কোর্ট লিগ্যাল এইড অফিসার",
    titleEn: "Supreme Court Legal Aid Officer",
    scopeBn: "আপিল বিভাগের মামলা",
    scopeEn: "Appellate Division cases",
    group: "courts",
  },
  {
    key: "labour",
    titleBn: "শ্রম লিগ্যাল এইড সেল কর্মকর্তা",
    titleEn: "Labour Legal Aid Cell Officer",
    scopeBn: "শ্রম ট্রিব্যুনালের মামলা",
    scopeEn: "Labour tribunal cases",
    group: "courts",
  },
  {
    key: "panel",
    titleBn: "প্যানেল আইনজীবী",
    titleEn: "Panel Lawyer",
    scopeBn: "শুধু নিজের দায়িত্বে দেওয়া মামলা",
    scopeEn: "Assigned cases only",
    group: "courts",
    legacyKeys: ["panel_lawyer"],
  },
  {
    key: "mediator",
    titleBn: "বিশেষ মধ্যস্থতাকারী",
    titleEn: "Special Mediator",
    scopeBn: "জেলা নিবন্ধিত মধ্যস্থতার অনুরোধ",
    scopeEn: "District-registered mediation requests",
    group: "district",
    legacyKeys: ["special_mediator"],
  },
  {
    key: "judge",
    titleBn: "বিচার বিভাগীয় ম্যাজিস্ট্রেট",
    titleEn: "Judicial Magistrate",
    scopeBn: "আদালত-পাশার দৃশ্য",
    scopeEn: "Court-side view",
    group: "courts",
  },
  {
    key: "callcentre",
    titleBn: "কল-সেন্টার অপারেটর",
    titleEn: "Call-Centre Operator",
    scopeBn: "জাতীয় হেল্পলাইন ১৬৬৯৯",
    scopeEn: "National helpline 16699",
    group: "national",
  },
  {
    key: "admin",
    titleBn: "DBLA জাতীয় প্রশাসক",
    titleEn: "DBLA National Administrator",
    scopeBn: "জাতীয় — বাধ্যতামূলক মধ্যস্থতার তালিকা ও জাতীয় ড্যাশবোর্ড",
    scopeEn: "National — configures the mandatory-mediation district list, national dashboard",
    group: "national",
  },
  {
    key: "ngo",
    titleBn: "এনজিও/সিএসও অ্যাক্রেডিটেড পার্টনার",
    titleEn: "NGO/CSO Accredited Partner",
    scopeBn: "রেফারেল উৎস",
    scopeEn: "Referral source",
    group: "partner",
  },
  {
    key: "mobile_agent",
    titleBn: "মোবাইল এজেন্ট",
    titleEn: "Mobile Agent",
    scopeBn: "মাঠ পর্যায়ে ভ্রাম্যমাণ দল — সহায়তায় আবেদন ও তথ্য সংগ্রহ",
    scopeEn: "Field mobile team — assisted filing and information collection",
    group: "partner",
  },
  {
    key: "udc",
    titleBn: "ইউডিসি উদ্যোক্তা",
    titleEn: "UDC Entrepreneur",
    scopeBn: "ইউনিয়ন ডিজিটাল সেন্ট্র — সহায়তায় আবেদন",
    scopeEn: "Union Digital Centre — assisted filing",
    group: "partner",
    legacyKeys: ["udc_entrepreneur"],
  },
  {
    key: "referral",
    titleBn: "রেফারেল কমিটি প্রতিনিধি",
    titleEn: "Referral Committee Representative",
    scopeBn: "উপজেলা কমিটি (UzLAC)",
    scopeEn: "Upazila committee (UzLAC)",
    group: "partner",
  },
];

/** Legacy keys with no canonical equivalent; still valid, not offered in the picker. */
const LEGACY_ONLY: RoleDefinition[] = [
  {
    key: "metropolitan_legal_aid_officer",
    titleBn: "মেট্রোপলিটান লিগ্যাল এইড অফিসার",
    titleEn: "Metropolitan Legal Aid Officer",
    scopeBn: "মেট্রোপলিটন এলাকার কার্যালয়",
    scopeEn: "Metropolitan area office",
    group: "district",
  },
  {
    key: "paralegal",
    titleBn: "প্যারালিগ্যাল",
    titleEn: "Paralegal",
    scopeBn: "কার্যালয় সহায়তা কর্মী",
    scopeEn: "Office support staff",
    group: "district",
  },
];

export const ALL_ROLE_DEFINITIONS: RoleDefinition[] = [...ROLE_DEFINITIONS, ...LEGACY_ONLY];

const BY_KEY = new Map(ALL_ROLE_DEFINITIONS.map((r) => [r.key, r]));

const ALIAS = new Map<string, string>();
for (const role of ROLE_DEFINITIONS) {
  for (const legacy of role.legacyKeys ?? []) ALIAS.set(legacy, role.key);
}

export function getRoleDefinition(role: string): RoleDefinition | null {
  return BY_KEY.get(role) ?? null;
}

/** True when `role` is a legacy key that maps onto a canonical role. */
export function isLegacyRole(role: string): boolean {
  return ALIAS.has(role) && !BY_KEY.has(role);
}

export function canonicalRole(role: string): string {
  return ALIAS.get(role) ?? role;
}

export function roleTitleBn(role: string): string {
  return BY_KEY.get(role)?.titleBn ?? role;
}

export function rolesInGroup(group: RoleGroupId): RoleDefinition[] {
  return ROLE_DEFINITIONS.filter((r) => r.group === group);
}

// ---------------------------------------------------------------------------
// Backwards-compatible surface. Everything below is what the rest of the app
// already imports, kept intact so this change is additive.

export const APP_ROLES = [
  "citizen",
  "chief_legal_aid_officer",
  "metropolitan_legal_aid_officer",
  "dlao_officer",
  "special_mediator",
  "paralegal",
  "udc_entrepreneur",
  "panel_lawyer",
  // canonical keys added alongside the legacy ones above
  "dlao",
  "chief",
  "chairman",
  "chowki",
  "sclao",
  "labour",
  // "panel" is the canonical key; panel_lawyer above is its legacy alias. It must be
  // present here or isStaffRole("panel") rejects the most common staff login.
  "panel",
  "mediator",
  "judge",
  "callcentre",
  "admin",
  "ngo",
  "udc",
  "mobile_agent",
  "referral",
] as const;

export type AppRole = (typeof APP_ROLES)[number];
export type StaffRole = Exclude<AppRole, "citizen">;
export type VerificationStatus = "unverified" | "verified" | "pending";

export interface SessionUser {
  id: string;
  displayName: string;
  role: AppRole;
  status: "active" | "disabled";
  verificationStatus: VerificationStatus;
  isMock: boolean;
}

export const ROLE_LABELS: Record<AppRole, string> = {
  citizen: "আবেদনকারী",
  chief_legal_aid_officer: "চীফ লিগ্যাল এইড অফিসার",
  metropolitan_legal_aid_officer: "মেট্রোপলিটান লিগ্যাল এইড অফিসার",
  dlao_officer: "জেলা লিগ্যাল এইড অফিসার",
  special_mediator: "বিশেষ মধ্যস্থতাকারী",
  paralegal: "প্যারালিগ্যাল",
  udc_entrepreneur: "ইউডিসি উদ্যোক্তা",
  panel_lawyer: "প্যানেল আইনজীবী",
  panel: "প্যানেল আইনজীবী",
  dlao: "লিগ্যাল এইড অফিসার",
  chief: "চীফ লিগ্যাল এইড অফিসার",
  chairman: "জেলা কমিটির চেয়ারম্যান",
  chowki: "চৌকি আদালতের লিগ্যাল এইড অফিসার",
  sclao: "সুপ্রীম কোর্ট লিগ্যাল এইড অফিসার",
  labour: "শ্রম লিগ্যাল এইড সেল কর্মকর্তা",
  mediator: "বিশেষ মধ্যস্থতাকারী",
  judge: "বিচার বিভাগীয় ম্যাজিস্ট্রেট",
  callcentre: "কল-সেন্টার অপারেটর",
  admin: "DBLA জাতীয় প্রশাসক",
  ngo: "এনজিও/সিএসও অ্যাক্রেডিটেড পার্টনার",
  udc: "ইউডিসি উদ্যোক্তা",
  mobile_agent: "মোবাইল এজেন্ট",
  referral: "রেফারেল কমিটি প্রতিনিধি",
};

function mock(name: string, role: StaffRole) {
  return { displayName: name, role, status: "active", verificationStatus: "verified" } as const;
}

export const MOCK_ROLE_IDENTITIES: Record<StaffRole, Omit<SessionUser, "id" | "isMock">> = {
  // legacy keys, unchanged
  chief_legal_aid_officer: mock("সাব্বির হাসান (মক)", "chief_legal_aid_officer"),
  metropolitan_legal_aid_officer: mock("নাজমা সুলতানা (মক)", "metropolitan_legal_aid_officer"),
  dlao_officer: mock("মো. করিম (মক)", "dlao_officer"),
  special_mediator: mock("ফারহানা আক্তার (মক)", "special_mediator"),
  paralegal: mock("তানভীর আহমেদ (মক)", "paralegal"),
  udc_entrepreneur: mock("রুবিনা ইয়াসমিন (মক)", "udc_entrepreneur"),
  panel_lawyer: mock("অ্যাডভোকেট শফিকুল ইসলাম (মক)", "panel_lawyer"),
  // canonical keys
  dlao: mock("মো. করিম (মক)", "dlao"),
  chief: mock("সাব্বির হাসান (মক)", "chief"),
  chairman: mock("অ্যাডভোকেট মাহবুবুর রহমান (মক)", "chairman"),
  chowki: mock("জাহিদ হাসান (মক)", "chowki"),
  sclao: mock("বারিস্তা খাতুন (মক)", "sclao"),
  labour: mock("সাইফুল ইসলাম (মক)", "labour"),
  panel: mock("অ্যাডভোকেট শফিকুল ইসলাম (মক)", "panel"),
  mediator: mock("ফারহানা আক্তার (মক)", "mediator"),
  judge: mock("মো. শাহেদুর রহমান (মক)", "judge"),
  callcentre: mock("নাজমা সুলতানা (মক)", "callcentre"),
  admin: mock("ড. রুমা চৌধুরী (মক)", "admin"),
  ngo: mock("তাসনিম জাহান (মক)", "ngo"),
  udc: mock("রুবিনা ইয়াসমিন (মক)", "udc"),
  mobile_agent: mock("সাইফুল ইসলাম (মক)", "mobile_agent"),
  referral: mock("মো. ইমরান (মক)", "referral"),
} as Record<StaffRole, Omit<SessionUser, "id" | "isMock">>;

export function isStaffRole(role: string): role is StaffRole {
  return (APP_ROLES as readonly string[]).includes(role) && role !== "citizen";
}

export function canAccessCase(role: AppRole, userId: string, ownerUserId: string): boolean {
  return role === "citizen" ? userId === ownerUserId : isStaffRole(role);
}
