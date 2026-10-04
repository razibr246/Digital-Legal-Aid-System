/**
 * The one hash used for voice PINs and session tokens.
 *
 * Shared deliberately. The PIN is verified elsewhere, so a second copy of this
 * function is a second implementation of a secret format: if the two ever disagreed,
 * a PIN reset by an administrator would produce a hash no login could verify, and the
 * applicant would simply lose access to 16699 with nothing in the logs to explain it.
 */

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Four digits, never a leading zero — the same rule the voice PIN has always used. */
export function generateVoicePin(): string {
  const value = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000);
  return String(value);
}
