import { chromium } from 'playwright-core';
const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext();
await ctx.grantPermissions(['microphone']);
const page = await ctx.newPage();
const seen = new Set();
page.on('console', m => { const t = m.text(); if (!t.includes('"tokens":[')) console.log('CONSOLE', m.type().slice(0,4), t.slice(0,400)); });
page.on('request', r => { if (r.url().includes('/api/llm')) console.log('REQ', r.method(), r.url()); });
page.on('response', r => { if (r.url().includes('/api/llm')) console.log('RESP', r.status(), r.url()); });
page.on('websocket', ws => {
  if (seen.has(ws)) return; seen.add(ws);
  const u = ws.url().replace('wss://legal-voice-agent.adribmahmud.workers.dev', '');
  console.log('WS', u);
  ws.on('framereceived', f => { const p = f.payload?.toString?.() || ''; if (p && !p.includes('"tokens":[')) console.log('WS<', u, p.slice(0, 240)); });
  ws.on('close', () => console.log('WS closed', u));
});
await page.goto('https://legal-voice-agent.adribmahmud.workers.dev/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
// start call
await page.getByRole('button', { name: /কল করুন/ }).click();
await page.waitForTimeout(14000); // greeting plays
// wait for IVR dialpad, then press IVR option 1 (dialpad key with text 1 + label সাধারণ)
console.log('--- pressing IVR 1 via numeric key');
const dial1 = page.locator('button', { hasText: /^۱$|^1$/ }).first();
if (await dial1.count()) await dial1.click(); else console.log('dial1 NOT FOUND');
await page.waitForTimeout(6000);
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(5000);
  const text = (await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: '/tmp/opencode/shot' + i + '.png' });
  if (text.includes('tool')) console.log('TOOL ACTIVITY SEEN at', i);
}
console.log('--- FINAL PAGE TEXT ---');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 3500));
await b.close();
