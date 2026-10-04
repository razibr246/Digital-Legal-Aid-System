"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Where this sits and why.
 *
 * The portal already owns the bottom-right corner: the landing page has
 * `.ref-floating-call` (bottom 20px, z 480) and citizen pages have `AgentFab`
 * (bottom var(--space-xl), z 40). A chat launcher dropped into the same corner
 * would sit on top of the 16699 call button, which is the single most important
 * action on the site.
 *
 * So the launcher stacks directly ABOVE the call button, and the panel opens
 * above both. The call button is untouched, so nothing about the tested voice
 * path changes.
 *
 * Layout lives in `app/globals.css` (.uchat-*) rather than inline styles
 * because it has to change at 640px: a fixed bottom offset collapses the panel
 * on a phone once the keyboard shrinks the dynamic viewport, which left a
 * floating strip with the page showing through. Below 640px it is a full-screen
 * sheet instead.
 */

const SUGGESTIONS = [
  "আইনি সহায়তার জন্য কী কী ডকুমেন্ট লাগে?",
  "কোনো সমস্যায় কীভাবে আবেদন করব?",
  "আমার ডকেট নম্বর কীভাবে ট্র্যাক করব?",
];

const MOBILE_QUERY = "(max-width: 639px)";

/**
 * Colours are inline on purpose.
 *
 * The header is white text, so if a browser ever serves a stale stylesheet the
 * header background would be missing and the title would render white-on-white
 * and vanish. Inline styles always win over a stylesheet, so the panel stays
 * legible even when the cached CSS is out of date. Only geometry (position,
 * size, the 640px switch) lives in globals.css, where a stale sheet costs
 * layout rather than content.
 */
const HEAD_STYLE = { background: "var(--portal-accent, #15803d)", color: "#ffffff" } as const;
const HEAD_TEXT_STYLE = { color: "#ffffff" } as const;
const BODY_TEXT_STYLE = { color: "var(--portal-text, #0f172a)" } as const;
const MUTED_TEXT_STYLE = { color: "var(--portal-text-secondary, #475569)" } as const;
const SUGGESTION_STYLE = {
  border: "1px solid var(--portal-accent, #15803d)",
  color: "var(--portal-accent, #15803d)",
  background: "transparent",
} as const;
const SURFACE_STYLE = { background: "var(--portal-surface, #ffffff)" } as const;

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
}

function Bubble({ turn }: { turn: Turn }) {
  const isUser = turn.role === "user";
  return (
    <div className={isUser ? "uchat-row-user" : "uchat-row-bot"}>
      <div
        className={isUser ? "uchat-bubble-user" : "uchat-bubble-bot"}
        style={
          isUser
            ? { background: "var(--portal-accent, #15803d)", color: "#ffffff" }
            : { background: "var(--portal-surface, #f1f5f9)", color: "var(--portal-text, #0f172a)", borderColor: "#cbd5e1" }
        }
      >
        {turn.content}
      </div>
    </div>
  );
}

export function UniversalChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const cacheOpenedAtRef = useRef<number>(0);
  const titleId = useId();
  const logId = useId();

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  // The full-screen sheet owns the viewport on mobile, so stop the page behind
  // it from scrolling.
  useEffect(() => {
    if (!open || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open, isMobile]);

  /**
   * Pin the sheet to the VISUAL viewport.
   *
   * On Android, `position: fixed` resolves against the layout viewport. When
   * the on-screen keyboard opens, the visual viewport shrinks and the layout
   * viewport can scroll, which detaches a `top: 0; height: 100dvh` sheet and
   * pushes the header out of sight. visualViewport is the only reliable source
   * for the area not covered by the keyboard, so the sheet is sized and offset
   * from it directly.
   */
  useEffect(() => {
    if (!open || !isMobile) return;
    const viewport = window.visualViewport;
    if (!viewport) return;

    const sync = () => {
      const root = document.documentElement;
      root.style.setProperty("--uchat-vvh", `${Math.round(viewport.height)}px`);
      root.style.setProperty("--uchat-vvoffset", `${Math.round(viewport.offsetTop)}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      const root = document.documentElement;
      root.style.removeProperty("--uchat-vvh");
      root.style.removeProperty("--uchat-vvoffset");
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    // On mobile the keyboard would open immediately and squeeze the sheet; the
    // citizen taps the field when they are ready.
    if (!isMobile) inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        fabRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const node = logRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [turns, busy, open]);

  const send = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question || busy) return;

      const history = turns.slice(-6).map((turn) => ({ role: turn.role, content: turn.content }));

      setTurns((prev) => [
        ...prev,
        { id: `u-${Date.now()}`, role: "user", content: question },
        { id: "pending", role: "assistant", content: "" },
      ]);
      setDraft("");
      setError("");
      setBusy(true);

      // Open the retention window on the first question, then at most once every
      // four minutes. Re-sending a ttl re-bills the cache write premium, so
      // ordinary turns must omit it and pay the cache-read rate.
      const now = Date.now();
      const openCache =
        cacheOpenedAtRef.current === 0 || now - cacheOpenedAtRef.current > 4 * 60 * 1000;
      if (openCache) cacheOpenedAtRef.current = now;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ message: question, conversationId, history, openCache }),
        });
        const payload = (await response.json()) as {
          ok?: boolean;
          answer?: string;
          error?: string;
          conversationId?: string;
        };
        if (!response.ok || !payload.ok || !payload.answer) {
          throw new Error(payload.error || "উত্তর দেওয়া যায়নি");
        }
        if (payload.conversationId) setConversationId(payload.conversationId);
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === "pending"
              ? { ...turn, id: `a-${Date.now()}`, content: payload.answer || "" }
              : turn,
          ),
        );
      } catch (cause) {
        setTurns((prev) => prev.filter((turn) => turn.id !== "pending"));
        setError(cause instanceof Error ? cause.message : "উত্তর দেওয়া যায়নি");
      } finally {
        setBusy(false);
      }
    },
    [busy, conversationId, turns],
  );

  function close() {
    setOpen(false);
    fabRef.current?.focus();
  }

  const showWelcome = turns.length === 0;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="uchat-fab"
        data-open={open ? "true" : "false"}
        data-testid="chat-fab"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="universal-chat-panel"
        aria-label={open ? "সহায়ক বন্ধ করুন" : "আইনি সহায়তা সহায়ক খুলুন"}
      >
        <Bot aria-hidden="true" className="size-[18px]" />
        আইনি সহায়তা
      </button>

      {open && isMobile ? (
        <button
          type="button"
          className="uchat-scrim"
          aria-label="সহায়ক বন্ধ করুন"
          tabIndex={-1}
          onClick={close}
        />
      ) : null}

      {open ? (
        <div
          id="universal-chat-panel"
          className="uchat-panel"
          data-testid="chat-panel"
          data-layout={isMobile ? "sheet" : "docked"}
          style={SURFACE_STYLE}
          role="dialog"
          aria-modal={isMobile ? true : undefined}
          aria-labelledby={titleId}
        >
          <div className="uchat-head" style={HEAD_STYLE}>
            <div className="uchat-title">
              <Bot aria-hidden="true" className="size-[18px] shrink-0" style={HEAD_TEXT_STYLE} />
              <span id={titleId} style={HEAD_TEXT_STYLE}>
                আইনি সহায়তা সহায়ক
              </span>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="সহায়ক বন্ধ করুন"
              className="inline-flex cursor-pointer border-0 bg-transparent p-1"
              style={HEAD_TEXT_STYLE}
            >
              <X aria-hidden="true" className="size-[18px]" />
            </button>
          </div>

          <div
            ref={logRef}
            id={logId}
            role="log"
            aria-live="polite"
            aria-label="সহায়কের উত্তর"
            className="uchat-log"
            style={BODY_TEXT_STYLE}
          >
            {showWelcome ? (
              <div className="uchat-welcome" style={MUTED_TEXT_STYLE}>
                <p className="mb-2">
                  স্বাগতম। আইনি সহায়তা, আবেদন ও ডকেট সম্পর্কে সংক্ষেপে জানতে চাইলে লিখুন। জটিল
                  মামলার চূড়ান্ত সিদ্ধান্তের জন্য ১৬৬৯৯ এ কল করুন।
                </p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="uchat-suggestion"
                      style={SUGGESTION_STYLE}
                      onClick={() => void send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {turns.map((turn) => (
              <Bubble key={turn.id} turn={turn} />
            ))}

            {busy ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 aria-hidden="true" className="size-3 animate-spin" />
                ভাবছি…
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="m-0 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>

          <form
            className="uchat-composer"
            style={SURFACE_STYLE}
            onSubmit={(event) => {
              event.preventDefault();
              void send(draft);
            }}
          >
            <label htmlFor={`${logId}-input`} className="sr-only">
              আপনার প্রশ্ন
            </label>
            <input
              id={`${logId}-input`}
              ref={inputRef}
              className="uchat-input"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="প্রশ্ন লিখুন…"
              maxLength={800}
              autoComplete="off"
              style={{
                color: "var(--portal-text, #0f172a)",
                background: "var(--portal-surface, #ffffff)",
                borderColor: "#94a3b8",
              }}
            />
            <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="প্রশ্ন পাঠান">
              <Send aria-hidden="true" />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
