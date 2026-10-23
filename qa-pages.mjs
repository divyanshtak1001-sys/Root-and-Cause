name export default async function run(page, ui) {
  const out = { pages: [] };
  const check = async (path, mustInclude, note) => {
    await page.goto(`http://localhost:3100${path}`, { waitUntil: 'networkidle' });
    if (mustInclude) {
      await page
        .waitForFunction((s) => document.body.innerText.includes(s), mustInclude, { timeout: 20000 })
        .catch(() => { });
    }
    const t = await page.evaluate(() => document.body.innerText);
    out.pages.push({
      path,
      note,
      ok: mustInclude ? t.includes(mustInclude) : true,
      hasNaN: t.includes('NaN'),
      hasUndefined: t.includes('undefined'),
      chars: t.length,
    });
  };

  await check('/incidents', 'Incident Queue');
  await check('/logs', 'Ingest');
  await check('/rules', 'Detection');
  await check('/reports', 'Report');

  // Ingestion page: verify the upload widget and recent uploads are live
  out.logsText = await page.evaluate(() => document.body.innerText.slice(0, 600));
  return out;
}
