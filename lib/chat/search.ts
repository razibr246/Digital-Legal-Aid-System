import type { WebSource } from "./memory/types";

/**
 * Pluggable web search. The default needs no API key; a paid provider can be
 * dropped in later without touching the orchestrator.
 */
export interface WebSearchProvider {
  readonly name: string;
  search(query: string, limit?: number): Promise<WebSource[]>;
}

const OFFICIAL_HOST_HINTS = [
  "nlaso.gov.bd",
  "lawyers.gov.bd",
  "moj.gov.bd",
  "bdlaws.minlaw.gov.bd",
  "supremecourt.gov.bd",
  "bangladesh.gov.bd",
  "nirc.gov.bd",
  "gob.bd",
  "un.org",
  "ilo.org",
  "undp.org",
  "unwomen.org",
  "amnesty.org",
  "hrw.org",
];

export function isOfficialSource(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_HOST_HINTS.some((hint) => host === hint || host.endsWith(`.${hint}`));
  } catch {
    return false;
  }
}

/**
 * Keeps the assistant inside its remit. Search is for Bangladesh legal aid
 * topics; anything else is answered from memory or declined.
 */
const IN_SCOPE = [
  "legal aid", "আইনি সহায়তা", "আইন সহায়তা", "lawyer", "আইনজীবী", "advocate", "কোর্ট",
  "court", "মামলা", "case", "filing", "আর্জি", "law", "আইন", "judge", "বিচার", "police",
  "পুলিশ", "fraud", "জালিয়াতি", "cheque", "চেক", "debt", "ঋণ", "land", "জমি", "property",
  "সম্পত্তি", "domestic violence", "সহিংসতা", "child", "শিশু", "marriage", "বিয়ে", "divorce",
  "তালাক", "inheritance", "উত্তরাধিকার", "custody", "অভিভাবক", "16699", "legal",
  "human rights", "মানবাধিকার", "trafficking", "প্রতারণা", "accident", "দুর্ঘটনা",
  "rent", "বাড়ি ভাড়া", "employment", "শ্রম", "labour", "বেতন", " arrest", "গ্রেপ্তার",
  "identity", "পরিচয়", "nid", "জাতীয় পরিচয়পত্র", "mediation", "মধ্যস্থতা",
];

export function isLegalAidScope(query: string): boolean {
  const text = query.toLowerCase();
  return IN_SCOPE.some((term) => text.includes(term));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&nbsp;/g, " ");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Keyless DuckDuckGo HTML endpoint. Free and adequate for orientation, but it
 * is scraped rather than contractual, so failures are swallowed and the caller
 * falls back to memory-only answers.
 */
class DuckDuckGoHtmlProvider implements WebSearchProvider {
  readonly name = "duckduckgo-html";

  async search(query: string, limit = 4): Promise<WebSource[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DLAS-Chatbot/1.0; +legal-aid-assistant)",
            Accept: "text/html",
          },
          signal: controller.signal,
        },
      );
      if (!response.ok) return [];
      const html = await response.text();

      const results: WebSource[] = [];
      const linkPattern =
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetPattern =
        /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
      const snippets: string[] = [];
      let snippetMatch: RegExpExecArray | null;
      while ((snippetMatch = snippetPattern.exec(html)) && snippets.length < limit) {
        snippets.push(stripTags(snippetMatch[1]));
      }

      let match: RegExpExecArray | null;
      while ((match = linkPattern.exec(html)) && results.length < limit) {
        const href = decodeEntities(match[1]);
        const title = stripTags(match[2]);
        if (!title) continue;
        // DuckDuckGo wraps results in a redirect; keep the readable target.
        const target = /uddg=([^&]+)/.exec(href);
        const url = target ? decodeURIComponent(target[1]) : href;
        if (!/^https?:\/\//i.test(url)) continue;
        results.push({
          title,
          url,
          snippet: snippets[results.length] || "",
        });
      }
      return results;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}

export const defaultWebSearchProvider: WebSearchProvider = new DuckDuckGoHtmlProvider();
