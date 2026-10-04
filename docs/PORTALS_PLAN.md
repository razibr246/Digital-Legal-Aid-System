# PORTALS_PLAN.md
## Task 1 — Reconnaissance & Portal Architecture Map

---

## 1. AI Agent Boundary — READ-ONLY FILES (never touch)

The following files and routes are the AI agent's exclusive domain.
They are locked for the remainder of this build. Any new feature that
seems to require touching them must be surfaced to the owner first.

### Source files (lib/)
| File | Why it's locked |
|------|----------------|
| `lib/agent/core/agent-engine.ts` | System prompt, LLM call, tool config, streaming logic |
| `lib/agent/tools/legal-tools.ts` | All Zod tool definitions (docket, eligibility, statutes, escalation) |
| `lib/agent/knowledge/statutes.ts` | Legal statute knowledge base |
| `lib/agent/knowledge/universal-inquiries.ts` | FAQ knowledge base v1 |
| `lib/agent/knowledge/universal-inquiries_v2.ts` | FAQ knowledge base v2 (runtime search) |
| `lib/agent/memory/docket-store.ts` | In-memory docket singleton — agent's working memory |
| `lib/voice-sdk/client.ts` | VoiceAgent class entry point |
| `lib/voice-sdk/types.ts` | SDK event/config type contracts |
| `lib/voice-sdk/audio/mic.ts` | Microphone capture |
| `lib/voice-sdk/audio/worklet.ts` | Audio worklet processor |
| `lib/voice-sdk/direct/direct_session.ts` | Full voice pipeline orchestrator |
| `lib/voice-sdk/direct/soniox_stt.ts` | Soniox STT WebSocket client |
| `lib/voice-sdk/direct/ws_tts.ts` | Soniox TTS WebSocket client |
| `lib/voice-sdk/direct/vad.ts` | Voice Activity Detection |
| `lib/voice-sdk/direct/smart_turn.ts` | Turn-taking logic |
| `lib/voice-sdk/direct/turn_phase.ts` | Turn phase state machine |
| `lib/voice-sdk/direct/stt_types.ts` | STT type definitions |
| `lib/settings/agent-settings.ts` | Agent settings store (prompts, model, voice) |
| `server/tts-proxy.ts` | TTS WebSocket proxy server |
| `instrumentation.ts` | Server startup hook — boots TTS proxy |

### API routes (app/api/)
| Route | Why it's locked |
|-------|----------------|
| `POST /api/llm` | Agentic LLM streaming endpoint — core agent contract |
| `GET /api/llm` | Health check for agent engine |
| `GET /api/agent/docket` | Read agent's in-memory docket |
| `POST /api/agent/docket` | Agent writes/syncs docket state |
| `GET /api/voice/config` | Voice SDK runtime config delivery |

### UI components (locked — agent's visual interface)
| File | Why it's locked |
|------|----------------|
| `components/softphone-modal.tsx` | The softphone/call UI — the agent's front-end |
| `components/portal-view.tsx` | Landing page + agent integration |
| `app/page.tsx` | Root page rendering portal-view + softphone |
| `app/settings/page.tsx` | Agent settings panel |
| `hooks/use-voice-session.ts` | Session lifecycle hook |
| `hooks/use-agent-settings.ts` | Settings hook |
| `hooks/use-case-docket.ts` | Docket polling hook |
| `worker-entry.ts` | Auto-generated Cloudflare Worker (never edit) |

### Config (do not change contract)
| File | Constraint |
|------|-----------|
| `wrangler.jsonc` | Env vars used by agent — additive-only |
| `next.config.ts` | `serverExternalPackages: ["ws"]` must stay |

---

## 2. Auth — One Login, Role-Based Redirect

### Existing auth infrastructure (confirmed)
The repo already has a working auth system:
- `lib/auth/roles.ts` — defines `AppRole` union type with 7 roles:
  `citizen`, `dlao_officer`, `chief_legal_aid_officer`,
  `metropolitan_legal_aid_officer`, `special_mediator`, `paralegal`, `udc_entrepreneur`
- `lib/auth/local-session.ts` — in-memory session store, cookie-based token
- `GET /api/auth/session` — reads `auth_session` cookie, returns `SessionUser`
- `POST /api/roles/complete` — creates citizen session after voice intake

### What we add (additive only)
A single login page at `/login` (extending existing `app/login/page.tsx`) that:
1. Citizens — identify via phone + PIN (demo stub). Sets `auth_session` cookie with `role: "citizen"` → redirect to `/citizen`.
2. Staff — identify via Employee ID + password (seeded mock users). Sets `auth_session` cookie with their role → redirect to role-appropriate portal.

**Role → portal redirect map:**

| Role | Redirect |
|------|---------|
| `citizen` | `/citizen` |
| `dlao_officer` | `/dlao` |
| `chief_legal_aid_officer` | `/dlao` |
| `metropolitan_legal_aid_officer` | `/dlao` |
| `special_mediator` | `/dlao` |
| `paralegal` | `/dlao` |
| `udc_entrepreneur` | `/dlao` |
| `panel_lawyer` *(new role — additive)* | `/lawyer` |

> `panel_lawyer` is not in the existing role list. It will be added
> additively to `roles.ts` — no existing role names or logic will be changed.

### Route guards
`middleware.ts` (new Next.js edge middleware) will:
- Redirect unauthenticated users hitting any portal route to `/login`
- Redirect authenticated users to their own portal if they try another role's route
- Never touch `/`, `/api/llm`, `/api/agent/*`, `/api/voice/*` — agent routes stay unguarded

### Session layering
The agent uses the same `auth_session` cookie and `GET /api/auth/session`.
We do not change either. Portal login sets/clears this same cookie.
No second session system is introduced.

---

## 3. URL & Route Structure

### Existing routes (untouched)
```
/                        → Landing page — unchanged
/login                   → Login page — EXTENDED, not replaced
/settings                → Agent settings — unchanged
/api/llm                 → Agent LLM streaming — locked
/api/agent/docket        → Agent docket — locked
/api/voice/config        → Voice config — locked
/api/auth/session        → Session read — locked
/api/roles/complete      → Citizen session creation — locked
/api/citizens            → Citizens stub — locked
```

### New routes (additive only)
```
CITIZEN PORTAL
/citizen                    → Dashboard / home (empty state for first-time)
/citizen/apply              → Multi-step application flow
/citizen/track              → Track application by ID
/citizen/documents          → My submitted documents + upload
/citizen/help               → AI agent entry point (opens existing softphone)

DLAO PORTAL
/dlao                       → Case queue dashboard
/dlao/cases/[id]            → Case detail + action
/dlao/search                → Search by name / Application ID / Case ID

PANEL LAWYER PORTAL
/lawyer                     → Worklist (assigned cases, soonest due first)
/lawyer/cases/[id]          → Case detail + accept/decline + update

SHARED API (new, additive)
/api/portal/cases           → List + create cases (D1)
/api/portal/cases/[id]      → Single case read/update
/api/portal/cases/[id]/updates  → Append progress update (lawyer → DLAO visible)
/api/portal/login           → Staff login (Employee ID + password)
/api/portal/citizen-login   → Citizen login (phone + docket token)
```

No existing route is renamed, moved, or changes its contract.

---

## 4. AI Agent Entry Points Inside Each Portal

The agent is surfaced identically in all three portals — a floating
**"সাহায্য চান? ১৬৬৯৯"** button in the bottom-right of every shell
that opens `softphone-modal.tsx` exactly as the landing page does today.

**Mechanism:** Each portal shell renders `<SoftphoneModal>` (imported from
`components/softphone-modal.tsx`) as a sibling to portal content, controlled
by a single `open` boolean. This is the same pattern `app/page.tsx` uses.
Zero changes to the modal or its hook.

Citizens on `/citizen/help` get a full-page framing with instructions
around the same button — the button itself is unchanged.

---

## 5. Backend Status — What Exists vs. What to Build

### What already exists (confirmed from code audit)

| System | Status | Location |
|--------|--------|----------|
| Role definitions (7 roles) | ✅ Complete | `lib/auth/roles.ts` |
| Session creation (citizen) | ✅ Complete | `lib/auth/local-session.ts` |
| Session read API | ✅ Complete | `GET /api/auth/session` |
| `citizens` D1 table | ✅ Migration exists | `migrations/0001_*.sql` |
| `users` D1 table | ✅ Migration exists | `migrations/0002_*.sql` |
| `auth_sessions` D1 table | ✅ Migration exists | `migrations/0002_*.sql` |
| `cases` D1 table | ✅ Migration exists | fields: `docket_id`, `citizen_user_id`, `problem`, `district`, `category`, `status`, `created_at` |
| In-memory docket (agent) | ✅ Complete | `lib/agent/memory/docket-store.ts` |

### What does NOT exist yet (to build minimally per task)

| System | Gap | Build in Task |
|--------|-----|--------------|
| `panel_lawyer` role | Not in roles.ts | Task 3 (additive) |
| Staff login API | No `/api/portal/login` | Task 3 |
| Staff session creation | Only citizen sessions exist | Task 3 |
| Case list/queue API | No `/api/portal/cases` | Task 4/5 |
| `assigned_lawyer_id` on cases | Not in cases table | Task 5 migration |
| `case_updates` table | Does not exist | Task 6 migration |
| Lawyer worklist query | Does not exist | Task 6 |

> **Single source of truth guarantee:** The `cases` D1 table is the one case
> record all three portals read and write. The agent's in-memory `docketStore`
> is ephemeral (voice session only) and feeds into `cases` via `/api/roles/complete`.
> We do not duplicate it.

---

## 6. Shared Design System — Folder Plan

```
lib/ui/
  components/
    Button.tsx          -- primary / secondary / ghost / danger variants
    FormField.tsx       -- label + input + inline error (validates-as-you-type)
    Card.tsx            -- content card with optional header/footer
    StatusBadge.tsx     -- color + icon + text (never color alone)
    Alert.tsx           -- info / warning / error / success toast
    EmptyState.tsx      -- warm illustrated empty states with CTA
    LoadingSpinner.tsx  -- skeleton + spinner variants
    Modal.tsx           -- accessible focus-trapped modal
  shell/
    CitizenShell.tsx    -- top bar (NLASO brand + lang toggle + logout) + bottom nav
    DlaoShell.tsx       -- top bar (officer brand + role badge) + compact left nav
    LawyerShell.tsx     -- top bar (lawyer brand) + simple nav
    AgentFab.tsx        -- floating help button, wraps SoftphoneModal (unchanged)
  theme/
    tokens.css          -- CSS custom properties: colors, spacing, radii, fonts
```

**Per-portal accent colors (shared neutral base, distinct identities):**
- Citizen: `--accent: #1a6b3a` (green — trust, government)
- DLAO: `--accent: #1a3d6b` (navy — authority, official)
- Lawyer: `--accent: #6b3a1a` (burgundy — professional, legal)

**Typography:** Hind Siliguri (Google Fonts) for Bangla + Latin.

---

## 7. Stated Assumptions

1. `panel_lawyer` added additively to `lib/auth/roles.ts` — existing union, array, and all callers unchanged (TypeScript union widens safely).
2. Staff login uses seeded mock credentials for demo (e.g., Employee ID `DLAO-001` / PIN `1234`).
3. Citizen portal login uses phone number + docket token issued by the voice agent.
4. The `cases` table `status` field will be extended with additional values via a new migration addendum — no existing data loss.
5. All D1 queries use the existing `DB` binding from `wrangler.jsonc`.
6. The existing `/login` page (`app/login/page.tsx`) will be extended to support staff login — not rebuilt from scratch.
