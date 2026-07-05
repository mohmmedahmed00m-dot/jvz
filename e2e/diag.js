const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.on('console', (msg) => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('response', (r) => { if (r.url().includes('/api/')) console.log('[API]', r.request().method(), r.url(), '->', r.status()); });

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.waitForSelector('input[type="email"]');
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  const email = `diag_${Date.now()}@example.com`;
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', 'RealPass123!');

  console.log('--- clicking submit ---');
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 10000 }),
    page.getByTestId('auth-submit').click(),
  ]);
  console.log('REGISTER STATUS:', resp.status());
  console.log('REGISTER BODY:', (await resp.text()).slice(0, 300));

  await page.waitForTimeout(3000);
  console.log('FINAL URL:', page.url());

  // Check page text for any error banner
  const errorBanner = await page.locator('.error-banner').textContent().catch(() => null);
  console.log('ERROR BANNER:', errorBanner);
  await browser.close();
})().catch(e => { console.error('DIAG FAIL:', e.message); process.exit(1); });
