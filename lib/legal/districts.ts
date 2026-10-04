export interface District {
  bn: string;
  en: string;
}

/**
 * All 64 districts, in the order the voice intake matches them. `extractDistrict`
 * returns the first hit, so a more specific name must never sit after a name that
 * is a substring of it (ঢাকা before নারায়ণগঞ্জ, for example).
 *
 * The voice list was missing the three hill districts and রাজবাড়ী, so a caller in
 * one of those four silently fell back to ঢাকা. They are appended at the end
 * rather than grouped into their divisions, because inserting them mid-list would
 * reorder names the voice path already depends on; none of the four is a substring
 * of another entry in either direction, so their position cannot change a match.
 */
export const BD_DISTRICTS: District[] = [
  { bn: "ঢাকা", en: "Dhaka" },
  { bn: "চট্টগ্রাম", en: "Chattogram" },
  { bn: "সিলেট", en: "Sylhet" },
  { bn: "রাজশাহী", en: "Rajshahi" },
  { bn: "খুলনা", en: "Khulna" },
  { bn: "বরিশাল", en: "Barishal" },
  { bn: "রংপুর", en: "Rangpur" },
  { bn: "ময়মনসিংহ", en: "Mymensingh" },
  { bn: "কুমিল্লা", en: "Cumilla" },
  { bn: "ফেনী", en: "Feni" },
  { bn: "নোয়াখালী", en: "Noakhali" },
  { bn: "বগুড়া", en: "Bogura" },
  { bn: "যশোর", en: "Jashore" },
  { bn: "পাবনা", en: "Pabna" },
  { bn: "দিনাজপুর", en: "Dinajpur" },
  { bn: "কুষ্টিয়া", en: "Kushtia" },
  { bn: "গাজীপুর", en: "Gazipur" },
  { bn: "নারায়ণগঞ্জ", en: "Narayanganj" },
  { bn: "টাঙ্গাইল", en: "Tangail" },
  { bn: "জামালপুর", en: "Jamalpur" },
  { bn: "কক্সবাজার", en: "Cox's Bazar" },
  { bn: "ব্রাহ্মণবাড়িয়া", en: "Brahmanbaria" },
  { bn: "চাঁদপুর", en: "Chandpur" },
  { bn: "লক্ষ্মীপুর", en: "Lakshmipur" },
  { bn: "নরসিংদী", en: "Narsingdi" },
  { bn: "মাদারীপুর", en: "Madaripur" },
  { bn: "শরীয়তপুর", en: "Shariatpur" },
  { bn: "ফরিদপুর", en: "Faridpur" },
  { bn: "গোপালগঞ্জ", en: "Gopalganj" },
  { bn: "মুন্সীগঞ্জ", en: "Munshiganj" },
  { bn: "মানিকগঞ্জ", en: "Manikganj" },
  { bn: "কিশোরগঞ্জ", en: "Kishoreganj" },
  { bn: "নেত্রকোণা", en: "Netrokona" },
  { bn: "শেরপুর", en: "Sherpur" },
  { bn: "সিরাজগঞ্জ", en: "Sirajganj" },
  { bn: "নাটোর", en: "Natore" },
  { bn: "নওগাঁ", en: "Naogaon" },
  { bn: "চাঁপাইনবাবগঞ্জ", en: "Chapainawabganj" },
  { bn: "জয়পুরহাট", en: "Joypurhat" },
  { bn: "বাগেরহাট", en: "Bagerhat" },
  { bn: "সাতক্ষীরা", en: "Satkhira" },
  { bn: "ঝিনাইদহ", en: "Jhenaidah" },
  { bn: "মাগুরা", en: "Magura" },
  { bn: "নড়াইল", en: "Narail" },
  { bn: "চুয়াডাঙ্গা", en: "Chuadanga" },
  { bn: "মেহেরপুর", en: "Meherpur" },
  { bn: "ভোলা", en: "Bhola" },
  { bn: "পটুয়াখালী", en: "Patuakhali" },
  { bn: "বরগুনা", en: "Barguna" },
  { bn: "পিরোজপুর", en: "Pirojpur" },
  { bn: "ঝালকাঠি", en: "Jhalokathi" },
  { bn: "সুনামগঞ্জ", en: "Sunamganj" },
  { bn: "হবিগঞ্জ", en: "Habiganj" },
  { bn: "মৌলভীবাজার", en: "Moulvibazar" },
  { bn: "কুড়িগ্রাম", en: "Kurigram" },
  { bn: "গাইবান্ধা", en: "Gaibandha" },
  { bn: "লালমনিরহাট", en: "Lalmonirhat" },
  { bn: "নীলফামারী", en: "Nilphamari" },
  { bn: "পঞ্চগড়", en: "Panchagarh" },
  { bn: "ঠাকুরগাঁও", en: "Thakurgaon" },
  // Chattogram Hill Tracts, and the one Dhaka-division district the voice list
  // had omitted. See the note above on ordering.
  { bn: "বান্দরবান", en: "Bandarban" },
  { bn: "খাগড়াছড়ি", en: "Khagrachhari" },
  { bn: "রাঙ্গামাটি", en: "Rangamati" },
  { bn: "রাজবাড়ী", en: "Rajbari" },
];

/**
 * Best-effort district from a free-text address. Shared by the voice intake
 * (spoken address) and the portal form (typed address) so both resolve the same.
 */
export function extractDistrict(address: string): string | null {
  for (const district of BD_DISTRICTS) {
    if (address.includes(district.bn)) return district.bn;
  }
  return null;
}
