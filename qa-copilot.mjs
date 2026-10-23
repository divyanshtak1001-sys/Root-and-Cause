export default async function run(page) {
  const out = {};
  await page.goto('http://localhost:3100/incidents', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  const first = page.locator('a[href^="/incidents/"]').first();
  out.incidentHref = await first.getAttribute('href');
  await first.click();
  await page.waitForTimeout(3000);

  const t1 = await page.evaluate(() => document.body.innerText);
  out.detailLoaded = t1.includes('Root & Reason SOC Assistant active');
  out.timelineVisible = /timeline|chronolog/i.test(t1);
  out.ruleIds = [...new Set(t1.match(/RULE_[A-Z_]+/g) || [])];
  out.attackIds = [...new Set(t1.match(/T1\d{3}(?:\.\d{3})?/g) || [])];

  const input = page.locator('input[placeholder^="Ask Alexa+"]');
  await input.fill('What happened before the successful login?');
  await input.press('Enter');
  await page
    .waitForFunction(() => /EVENT ID|evt_bf_|consecutive authentication failures/i.test(document.body.innerText), { timeout: 45000 })
    .catch(() => { });
  await page.waitForTimeout(1500);

  const t2 = await page.evaluate(() => document.body.innerText);
  out.chatAnswered = /consecutive authentication failures|evt_bf_\d+/i.test(t2);
  out.evidenceIdsShown = [...new Set(t2.match(/evt_[a-z0-9_]+/g) || [])].slice(0, 8);

  return out;
}
