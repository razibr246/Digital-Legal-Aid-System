import type { ChatMessage } from "./deepinfra";
import type { MemoryBlock, RetrievedFact, WebSource } from "./memory/types";

/**
 * The stable prefix. Everything here is identical for every question, which is
 * what makes prompt cache retention pay: it all sits before the breakpoint.
 */
const CORE_INSTRUCTIONS = `You are the universal assistant for the National Legal Aid Services Organisation (NLASO) of Bangladesh.

Who you serve: visitors to the national legal aid portal and registered citizens. You do NOT serve DLAO or other staff — if asked, say staff have their own assistant.

Your scope, in order of priority:
1. Bangladesh legal aid: who qualifies, how to apply, required documents, fees, timelines, and the process at a District Legal Aid Office.
2. The portal itself: voice intake by phone, docket tracking, identity verification, e-signature, SMS PIN.
3. General legal orientation in plain language for a Bangladeshi citizen.

Answer style — this matters as much as correctness:
- Answer in Bangla by default. Use English only when the citizen writes in English.
- Be CONCISE. Lead with the direct answer in the first sentence.
- Organise with short paragraphs or a tight bullet list. No long preambles, no restating the question.
- Plain language a non-lawyer understands. Define a legal term the first time you use it.
- Be honest about limits. If the memory does not cover it, say so plainly and point to 16699.
- Never invent a statute number, a fee, a deadline, or a case outcome. If you are not certain, say you are not certain.
- Never give a final legal conclusion on a live dispute. Explain the general position and recommend a panel lawyer via 16699.
- Do not ask for or repeat a citizen's NID, phone number, or address.

Output format:
- Reply with the answer only. No preamble, no "Here is", no markdown headings above the first line.
- Cite memory with bracketed ids like [MEM-abc123] when you use a specific fact.
- If web results were provided, cite them as [1], [2] matching the numbered list, and add a "Sources" line at the end.
- Keep the whole answer under 180 words unless the citizen explicitly asks for detail.`;

function renderFact(fact: RetrievedFact): string {
  const provenance = fact.authority ? ` (authority: ${fact.authority})` : "";
  const url = fact.sourceUrl ? ` source: ${fact.sourceUrl}` : "";
  return `- [${fact.id}] ${fact.title}${provenance}${url}\n  ${fact.body.replace(/\s+/g, " ").trim()}`;
}

/**
 * Assembles the message list.
 *
 * Order is deliberate and load-bearing:
 *   [system: instructions + core memory + breakpoint]  <- retained cache prefix
 *   [system: retrieved memory for THIS question]      <- varies, must not be cached
 *   [user/assistant: recent conversation]
 *   [user: the question]
 *
 * The cache breakpoint sits on the first system message, so a change to a
 * question only re-reads the prefix instead of re-prefilling it.
 */
export function buildChatMessages(input: {
  memory: MemoryBlock;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  question: string;
  webResults?: WebSource[];
}): ChatMessage[] {
  const { memory, history, question, webResults } = input;

  const coreSection = memory.core.length
    ? [
        "Verified legal aid memory (always available, Bangladesh only):",
        ...memory.core.map(renderFact),
      ].join("\n")
    : "Verified legal aid memory is currently empty. Say so and offer 16699.";

  const cachedPrefix: ChatMessage = {
    role: "system",
    content: [
      { type: "text", text: `${CORE_INSTRUCTIONS}\n\n${coreSection}` },
    ],
  };
  // The provider applies retention to everything up to and including the part
  // carrying the breakpoint.
  (cachedPrefix.content as Array<Record<string, unknown>>)[0].prompt_cache_breakpoint = {
    mode: "explicit",
  };

  const messages: ChatMessage[] = [cachedPrefix];

  if (memory.retrieved.length) {
    messages.push({
      role: "system",
      content: [
        "Additional memory retrieved for this question:",
        ...memory.retrieved.map(renderFact),
      ].join("\n"),
    });
  }

  if (webResults?.length) {
    messages.push({
      role: "system",
      content: [
        "Web search results for this question. They are outside our verified memory:",
        "use them only for factual orientation, keep them inside Bangladesh legal aid scope,",
        "and say plainly when a result is not from an official source.",
        ...webResults.map(
          (result, index) => `[${index + 1}] ${result.title}\n${result.snippet}\n${result.url}`,
        ),
      ].join("\n"),
    });
  }

  for (const turn of history.slice(-6)) {
    messages.push({ role: turn.role, content: turn.content });
  }

  messages.push({ role: "user", content: question });
  return messages;
}

export const CHAT_SYSTEM_INSTRUCTIONS = CORE_INSTRUCTIONS;
