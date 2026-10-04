/**
 * Legal Aid Voice Agent Core Engine (Vercel AI SDK Core v7)
 *
 * Implements:
 * - High-speed multi-step agentic loop (`stopWhen: isStepCount(4)`)
 * - Native Zod function calling with zero-overhead execution
 * - Direct connection to Groq LPU (`openai/gpt-oss-120b`) for high-quality reasoning
 * - Empathetic, authoritative, conversational Bengali voice persona
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { SessionUser } from "../../auth/roles";
import type { IndigenousLanguage } from "../knowledge/indigenous-language-lexicon";
import { streamText, isStepCount, type ModelMessage } from "ai";
import { createLegalAidTools } from "../tools/legal-tools";
import { docketStore } from "../memory/docket-store";
import {
  getUniversalGeneralKnowledgeBlock,
  searchUniversalInquiries,
} from "../knowledge/universal-inquiries_v2";
import { getSeverityClassificationKnowledgeBlock } from "../knowledge/severity-classification";

const groqClient = createOpenAI({
  baseURL: process.env.LLM_PROVIDER_URL || "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY || "",
});

export const LEGAL_AGENT_SYSTEM_PROMPT = `
আপনি "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইন, ১৬৬৯৯" (National Legal Aid Services Organization - NLASO)-এর ভার্চুয়াল আইনি অ্যাসিস্ট্যান্ট।

কথোপকথনের শুরুতে কলারকে ইতোমধ্যে এই দুটি বার্তা জানানো হয়েছে:
১ম বার্তা: "বাংলাদেশ সরকারের বিনামূল্যে আইনি সহায়তা হেল্পলাইনে আপনাকে স্বাগতম। আপনাকে সঠিক সেবা প্রদান এবং ভবিষ্যতের প্রয়োজনে আমাদের এই কথোপকথনটি রেকর্ড করা হচ্ছে।"
২য় বার্তা: "সাধারণ তথ্য জানতে ১ চাপুন, কিন্তু কোনো সমস্যা বা অভিযোগ জানাতে ২ চাপুন।"
সুতরাং এই প্রারম্ভিক বার্তা দুটি পুনরায় বলবেন না।

আইভিআর (IVR) মেন্যু নির্দেশিকা:
- কলার যদি '১' চাপেন বা সাধারণ তথ্যের বিকল্প নির্বাচন করেন: অতি সংক্ষেপে কেবল বলুন: "জি, সাধারণ তথ্যের জন্য আপনার প্রশ্নটি বলুন, আমি শুনছি।" কোনো দীর্ঘ ভূমিকা বা বিস্তারিত তালিকা দেবেন না, যাতে কলার অবিলম্বে তার সাধারণ প্রশ্নটি বলতে পারেন। এরপর কলার যখন নির্দিষ্ট প্রশ্ন করবেন, তখন সার্বজনীন তথ্যাবলী থেকে সঠিক ও সংক্ষিপ্ত উত্তর দিন।
- কলার যদি '২' চাপেন বা সরাসরি কোনো অভিযোগ/আইনি সমস্যা বলেন: অতি সংক্ষেপে বলুন: "জি, আপনার আইনি অভিযোগটি বলুন, আপনার নাম ও জেলা কী?" এবং কেস ডকেট তৈরির পদক্ষেপ নিন।
- কলার সাধারণ তথ্যের পথে ব্যক্তিগত সমস্যা, নিরাপত্তা ঝুঁকি, সহিংসতা, আটকে রাখা, সাইবার ব্ল্যাকমেইল, জমি দখল, বেতন বা পারিবারিক বাধার তথ্য জানালে severity knowledge base অনুযায়ী বিষয়টি স্বীকার করে প্রয়োজন হলে আইনি সহায়তা আবেদন ও অভিযোগ নথিভুক্ত করতে চান কি না জিজ্ঞেস করুন। ট্যাগ বা স্কোর কথোপকথনে প্রকাশ করবেন না এবং সিদ্ধান্ত নিজে চূড়ান্ত করবেন না।


আপনার দায়িত্ব:
১. কলারের আইনি সমস্যা (ফৌজদারি জামিন, পারিবারিক নির্যাতন, দেনমোহর, জমিজমা দখল বা শ্রমিকের মজুরি) মনোযোগ দিয়ে শোনা ও তাৎক্ষণিক সহানুভূতি প্রকাশ করা।
২. সাধারণ তথ্য বা প্রশ্নের জন্য সার্বজনীন তথ্য সম্ভার (Universal Inquiries) থেকে অবিলম্বে নির্ভুল উত্তর দেওয়া।
৩. কলারের নাম, জেলা, ঘটনার বিবরণ জানা মাত্রই 'updateCaseDocket' টুল ব্যবহার করে ডকেট আপডেট করা।
৪. কলার যদি দরিদ্র, নারী, শিশু, বা সহিংসতার শিকার হন, তৎক্ষণাৎ 'checkLegalAidEligibility' টুল কল করে বিনামূল্যে আইনি সহায়তার যোগ্যতা যাচাই করা।
৫. সঠিক আইনগত প্রতিকার জানতে 'lookupLegalStatute' টুল কল করে আইন ও ধারার তথ্য সংগ্রহ করা।
৬. কলার যদি তাৎক্ষণিক শারীরিক বিপদে থাকেন, সাথে সাথে 'escalateEmergencyCase' টুল কল করা।
৭. আইনি তথ্য প্রদানের পর 'generateCaseDocketToken' টুল কল করে কলারকে একটি ডকেট নম্বর প্রদান করা।

কথোপকথনের নিয়মাবলী (Voice Guidelines):
- ভয়েস এজেন্টের জন্য আপনার উত্তর অবশ্যই খুব সংক্ষিপ্ত (১-২ বাক্য), স্পষ্ট ও স্বাভাবিক কথ্য বাংলায় (Spoken Bengali) হতে হবে।
- কোনো দীর্ঘ অনুচ্ছেদ, ইংরেজি শব্দ, স্টার চিহ্ন (*), হ্যাশ (#) বা বুলেট পয়েন্ট ব্যবহার করবেন না। কারণ আপনার টেক্সট সরাসরি স্পিচ সিন্থেসাইজারে (TTS) অডিও আকারে পাঠ করা হবে।
- প্রতিটি পদক্ষেপে কলারকে আশ্বস্ত করুন এবং আইনের বাস্তবসম্মত পরবর্তী ধাপ জানিয়ে দিন।
`;

export async function runLegalAgentSession({
  sessionId,
  messages,
  authenticatedUser = null,
  indigenousLanguage = "bn",
}: {
  sessionId: string;
  messages: ModelMessage[];
  authenticatedUser?: SessionUser | null;
  indigenousLanguage?: IndigenousLanguage;
}) {
  const modelName = process.env.LLM_MODEL || "openai/gpt-oss-120b";
  const tools = createLegalAidTools(sessionId);
  const currentDocket = docketStore.getOrCreate(sessionId);

  // Extract caller's latest query to dynamically match and push universal inquiries at runtime
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  let lastUserText = "";
  if (lastUserMsg) {
    if (typeof lastUserMsg.content === "string") {
      lastUserText = lastUserMsg.content;
    } else if (Array.isArray(lastUserMsg.content)) {
      lastUserText = lastUserMsg.content
        .map((part) => (typeof part === "string" ? part : "text" in part ? (part as { text: string }).text : ""))
        .join(" ");
    }
  }

  // Sub-millisecond runtime query matching
  const matchedInquiries = lastUserText ? searchUniversalInquiries(lastUserText, 2) : [];
  let runtimeInquiryBlock = "";
  if (matchedInquiries.length > 0) {
    runtimeInquiryBlock = `
[কল চলাকালীন তাৎক্ষণিক সার্বজনীন তথ্য মিল (Runtime Universal Inquiries Matched)]:
${matchedInquiries
  .map(
    (item, idx) =>
      `${idx + 1}. [${item.categoryBn}]: ${item.questionBn}\n   সরকারি যাচাইকৃত উত্তর: ${item.answerBn}${
        item.systemAction ? `\n   প্রোটোকল ব্যবস্থা: ${item.systemAction}` : ""
      }`
  )
  .join("\n")}
`;
  }

  const universalGeneralKnowledge = getUniversalGeneralKnowledgeBlock();

  const authenticatedContext = authenticatedUser
    ? `\n[Voice login / Authenticated citizen]:\n- নাম: ${authenticatedUser.displayName}\n- ব্যবহারকারী আইডি: ${authenticatedUser.id}\n- ভূমিকা: ${authenticatedUser.role}\n- ব্যবহারকারী চাইলে তার আবেদন বা কেসের অবস্থা জানতে পারে; নতুন সমস্যা থাকলে সমস্যা ইনটেকে যান।`
    : "";

  // Augment system prompt with current working docket context and runtime injected universal inquiries
  const languageContext = indigenousLanguage === "marma"
    ? "কলার মারমা ভাষা বেছে নিয়েছেন। কেবল মারমা শব্দের অর্থ নির্ভরতার উপর ভিত্তি করে বাংলা আইনি অর্থ বুঝুন; চাকমা বা অন্য ভাষার অর্থ মেলাবেন না।"
    : indigenousLanguage === "chakma"
      ? "কলার চাকমা ভাষা বেছে নিয়েছেন। কেবল চাকমা শব্দের অর্থ নির্ভরতার উপর ভিত্তি করে বাংলা আইনি অর্থ বুঝুন; মারমা বা অন্য ভাষার অর্থ মেলাবেন না।"
      : "কলার বাংলা ভাষা বেছে নিয়েছেন।";

  const dynamicContext = `
[বর্তমান ডকেট মেমোরি / Current Docket State]:
- কলারের নাম: ${currentDocket.callerName ?? "অজানা"}
- জেলা: ${currentDocket.district ?? "অজানা"}
- মামলার ধরন: ${currentDocket.category ?? "অজানা"}
- যোগ্যতা স্ট্যাটাস: ${currentDocket.eligibilityStatus}
- ডকেট নম্বর: ${currentDocket.docketId ?? "এখনও তৈরি হয়নি"}
- জরুরি অবস্থা: ${currentDocket.urgency}
`;

  return streamText({
    model: groqClient.chat(modelName),
     system: `${LEGAL_AGENT_SYSTEM_PROMPT}\n${languageContext}\n${universalGeneralKnowledge}\n${getSeverityClassificationKnowledgeBlock()}${authenticatedContext}\n${dynamicContext}\n${runtimeInquiryBlock}`,
    messages,
    tools,
    stopWhen: isStepCount(4),
    temperature: 0.2,
    maxOutputTokens: 250,
  });
}
