eexport default async function run(page) {
  const failures = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failures.push({ status: r.status(), url: r.url() });
  });
  page.on('requestfailed', (r) => failures.push({ failed: true, url: r.url(), err: r.failure()?.errorText }));

  for (const p of ['/incidents', '/logs', '/rules', '/reports', '/dashboard']) {
    await page.goto(`http://localhost:3100${p}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
  }
  return { failures };
}
