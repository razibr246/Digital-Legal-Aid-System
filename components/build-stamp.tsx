/**
 * Shows the build the browser actually loaded.
 *
 * The shell carried a hardcoded "সর্বশেষ হালনাগাদ: ৭ সেপ্টেম্বর ২০২৬" — a date typed
 * once and never changed, so it said nothing about which code was running. That is how
 * several deploys went unnoticed: there was no way to tell whether the page in front of
 * you was the build someone believed had shipped, and the only evidence available was a
 * visual impression, which is exactly the kind of evidence people get wrong.
 *
 * Recorded at build time by scripts/write-build-info.mjs — reading it out of the
 * `/_next/static/…` path does not work on the App Router, where chunks carry no build
 * segment. It turns "is it updated?" into a glance, and gives a support answer that is
 * not "try clearing your cache".
 */

import { BUILD_SHA, BUILD_AT } from "@/lib/build-info";

export default function BuildStamp() {
  // Pinned to UTC, and it has to be.
  //
  // `toLocaleString` with `hour`/`minute` formats in the RUNTIME's timezone, and the two
  // runtimes here are six hours apart: the Worker is UTC, the browser is Asia/Dhaka. That
  // made the same build read "01:05" in the server-rendered HTML and "07:05" on the
  // client, so React threw a hydration mismatch (#418) on every page carrying this stamp
  // — /dlao among them — and no assertion in the ADR suite could tell a date bug from any
  // other page error.
  //
  // A build timestamp is a fact about the deployment rather than about the viewer's day,
  // so UTC is both the stable choice and the honest one. The raw ISO instant is in the
  // tooltip for anyone who needs the exact value.
  const when = new Date(BUILD_AT).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
  const shown = `${BUILD_SHA} · ${when} UTC`;

  return (
    <span
      title={`বিল্ড ${BUILD_SHA} · তৈরি ${BUILD_AT}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      বিল্ড: <b>{shown}</b>
    </span>
  );
}
