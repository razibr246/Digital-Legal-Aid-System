import { chromium } from 'playwright-core';

/**
 * Deterministic NID fixture for the identity suites.
 *
 * These suites previously read `/tmp/opencode/fake-nid2.png`, a file nothing
 * creates. They only passed while that file happened to survive in /tmp, so they
 * were not reproducible on a fresh machine or a new container.
 *
 * The card is rendered here with canvas instead: no external asset, no temp
 * path, and the printed text is real enough for the vision model to read, which
 * is what the OCR assertions actually depend on.
 */

/** A 17-digit number, so it passes the BD NID length check. */
const FIXTURE_NID = "19927451234022222";

export async function createNidFixture() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<canvas id="card" width="760" height="480"></canvas>');
    return await page.evaluate((nid) => {
      const canvas = document.getElementById("card");
      const g = canvas.getContext("2d");

      g.fillStyle = "#f2efe4";
      g.fillRect(0, 0, 760, 480);
      g.strokeStyle = "#1f5c3a";
      g.lineWidth = 8;
      g.strokeRect(10, 10, 740, 460);
      g.strokeRect(20, 20, 720, 440);

      g.fillStyle = "#111111";
      g.textBaseline = "alphabetic";
      g.font = "bold 26px sans-serif";
      g.fillText("GOVERNMENT OF THE PEOPLE'S REPUBLIC OF BANGLADESH", 40, 62);
      g.font = "bold 30px sans-serif";
      g.fillText("NATIONAL IDENTITY CARD", 40, 104);

      g.font = "bold 24px sans-serif";
      g.fillText("NID No: " + nid, 40, 168);
      g.fillText("Name: Nasrin Akter", 40, 212);

      g.font = "22px sans-serif";
      g.fillText("Mother's Name: Salma Begum", 40, 254);
      g.fillText("Father's Name: Abdul Karim", 40, 290);
      g.fillText("Date of Birth: 1997-04-12", 40, 326);
      g.fillText("Place of Birth: Dhaka", 40, 362);
      g.fillText("Address: Dhaka Sadar, Dhaka", 40, 398);
      g.fillText("Blood Group: B+", 40, 434);

      // A plain block on the right stands in for the portrait.
      g.fillStyle = "#d8d2c2";
      g.fillRect(520, 140, 190, 260);
      g.fillStyle = "#6b6558";
      g.font = "18px sans-serif";
      g.fillText("PHOTO", 578, 278);

      return canvas.toDataURL("image/png").split(",")[1];
    }, FIXTURE_NID);
  } finally {
    await browser.close();
  }
}

export const FIXTURE_NID_NUMBER = FIXTURE_NID;
