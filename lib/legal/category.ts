/**
 * Maps a free-text problem statement onto the internal legal category. Shared by
 * the voice intake and the portal application form so a case is categorised the
 * same way whichever way it arrives.
 */
export function inferLegalCategory(problem: string): string {
  if (/জামিন|গ্রেপ্তার|পুলিশ|আটক|মামলা|ধারা|ফৌজদারি/i.test(problem)) return "criminal_bail";
  if (/স্বামী|যৌতুক|মারধর|নির্যাতন|স্ত্রী|সংসার|তালাক/i.test(problem)) return "domestic_violence";
  if (/জমি|দখল|পৈতৃক|সীমানা|দলিল|খতিয়ান|জমিজমা/i.test(problem)) return "land_dispute";
  if (/বেতন|মালিক|কারখানা|শ্রমিক|বকেয়া|চাকরি|ওভারটাইম/i.test(problem)) return "labor_wage";
  if (/দেনমোহর|ভরণপোষণ|সন্তান|হেফাজত/i.test(problem)) return "family_dower_maintenance";
  // Checked last: "ছবি" and "ইন্টারনেট" are broad, so a land, family or labour
  // problem that happens to mention them keeps its own, more specific category.
  if (/ছবি|ছড়ানো|ফেসবুক|ফেক প্রোফাইল|ভুয়া প্রোফাইল|ব্ল্যাকমেইল|ইন্টারনেট|অনলাইন|সাইবার|হ্যাক|ডিজিটাল|ই-কমার্স|মোবাইল ব্যাংকিং|অ্যাকাউন্ট হ্যাক/i.test(problem)) return "cyber_harassment";
  return "general_civil";
}
