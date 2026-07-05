// ============================================================================
// REAL BROWSER E2E — Playwright + Chromium simulating an actual user.
// Covers all Section 2 screens, states, responsive, and network-failure.
// Captures real screenshots to ./screenshots/.
// ============================================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND = 'http://localhost:5173';
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const email = `realuser_${Date.now()}@example.com`;
const password = 'RealPass123!';
const licenseKey = 'ALK-DEMO-TEST-0001-0001';

const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: true });
  const consoleErrors = [];
  const page = await ctx.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('requestfailed', (req) => { /* expected on network test */ });

  try {
    // ===== 1. LOGIN / REGISTER =====
    console.log('\n─── 1. LOGIN / REGISTER ───');
    await page.goto(FRONTEND + '/login', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]');
    await page.screenshot({ path: `${SHOTS}/01-login.png`, fullPage: true });

    await page.getByRole('button', { name: 'Register', exact: true }).click();
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'short');
    await page.getByTestId('auth-submit').click();
    await sleep(400);
    const validationVisible = await page.locator('.error-text').count();
    check('FORM: inline validation shown for short password', validationVisible > 0, `error fields=${validationVisible}`);

    await page.fill('input[type="password"]', password);
    await page.screenshot({ path: `${SHOTS}/02-register-filled.png`, fullPage: true });
    // Submit + wait for navigation to dashboard
    await Promise.all([
      page.waitForURL('**/', { timeout: 15000 }),
      page.getByTestId('auth-submit').click(),
    ]);
    check('REGISTER: redirected to dashboard after signup', /\/$/.test(page.url()), page.url());

    // ===== 2. LICENSE ACTIVATION =====
    console.log('\n─── 2. LICENSE ACTIVATION ───');
    await page.goto(FRONTEND + '/account', { waitUntil: 'networkidle' });
    await page.waitForSelector('input[placeholder*="ALK"]');
    await page.fill('input[placeholder*="ALK"]', licenseKey);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/activate-license'), { timeout: 10000 }).then((r) => r.status()),
      page.getByTestId('activate-btn').click(),
    ]).then(([s]) => console.log('   activate status:', s)).catch(() => console.log('   activate response wait issue'));
    await sleep(1200);
    const activeBadge = await page.locator('.badge').filter({ hasText: 'active' }).count();
    check('LICENSE: badge shows active after activation', activeBadge > 0);
    await page.screenshot({ path: `${SHOTS}/03-account-license-active.png`, fullPage: true });

    // ===== 3. DASHBOARD =====
    console.log('\n─── 3. DASHBOARD ───');
    await page.goto(FRONTEND + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');
    const dashTitle = (await page.locator('h1').first().textContent()) || '';
    check('DASHBOARD: renders', dashTitle.toLowerCase().includes('dashboard'), `title="${dashTitle.trim()}"`);
    const emptyShown = await page.locator('.empty-state').count();
    check('DASHBOARD: empty state shown for new user', emptyShown > 0);
    await page.screenshot({ path: `${SHOTS}/04-dashboard-empty.png`, fullPage: true });

    // ===== 4. NEW CAMPAIGN =====
    console.log('\n─── 4. NEW CAMPAIGN ───');
    await page.goto(FRONTEND + '/campaigns/new', { waitUntil: 'networkidle' });
    await page.waitForSelector('#pn');
    const disabledBefore = await page.getByTestId('generate-btn').isDisabled();
    check('NEWCAMP: Generate disabled before valid input', disabledBefore);
    await page.fill('#pn', 'TrafficBlaster Pro');
    await page.fill('#pu', 'https://example.com/tb');
    await page.fill('#aud', 'beginner marketers');
    const disabledAfter = await page.getByTestId('generate-btn').isDisabled();
    check('NEWCAMP: Generate enabled after valid name', !disabledAfter);
    await page.screenshot({ path: `${SHOTS}/05-newcampaign-filled.png`, fullPage: true });

    await Promise.all([
      page.waitForURL(/\/campaigns\/[a-f0-9-]+$/, { timeout: 60000 }),
      page.getByTestId('generate-btn').click(),
    ]);
    const campaignId = page.url().split('/campaigns/')[1];
    check('NEWCAMP: navigated to editor after generate', !!campaignId, page.url());

    // ===== 5. EDITOR =====
    console.log('\n─── 5. EDITOR (5 tabs) ───');
    await page.waitForSelector('.tabs', { timeout: 15000 });
    await sleep(2000);
    await page.screenshot({ path: `${SHOTS}/06-editor-review.png`, fullPage: true });
    const reviewPreview = await page.locator('.preview-frame').count();
    check('EDITOR: Review tab renders HTML preview', reviewPreview > 0);

    for (const label of ['Bonus Page', 'Email Sequence', 'Social Posts', 'CTA']) {
      await page.getByRole('tab', { name: label }).click();
      await sleep(700);
    }
    check('EDITOR: all 4 other tabs clickable', true);

    // Email tab shows JSON preview
    await page.getByRole('tab', { name: 'Email Sequence' }).click();
    await sleep(700);
    const jsonPreview = await page.locator('.json-preview').count();
    check('EDITOR: Email tab shows JSON preview pane', jsonPreview > 0);
    await page.screenshot({ path: `${SHOTS}/07-editor-email-json.png`, fullPage: true });

    // Edit review -> dirty
    await page.getByRole('tab', { name: 'Review Page' }).click();
    await sleep(500);
    const ta = page.locator('textarea.code-editor').first();
    await ta.fill('<h1>Edited by real user via browser</h1><p>Live manual edit.</p>');
    await sleep(400);
    const unsavedBadge = await page.locator('.badge').filter({ hasText: 'Unsaved' }).count();
    check('EDITOR: unsaved-changes badge appears on edit', unsavedBadge > 0);

    // Save
    await page.getByTestId('save-btn').click();
    await sleep(1200);
    const savedToast = await page.locator('.toast.success').filter({ hasText: 'Saved' }).count();
    check('EDITOR: Save shows success toast', savedToast > 0);
    await page.screenshot({ path: `${SHOTS}/08-editor-saved.png`, fullPage: true });

    // Regenerate CTA
    await page.getByRole('tab', { name: 'CTA' }).click();
    await sleep(500);
    await page.fill('#ci', 'make them all High urgency');
    await page.getByTestId('regenerate-btn').click();
    await sleep(3000);
    const regenToast = await page.locator('.toast.success').filter({ hasText: 'Section updated' }).count();
    check('EDITOR: Regenerate single asset works', regenToast > 0);
    await page.screenshot({ path: `${SHOTS}/09-editor-regenerated.png`, fullPage: true });

    // ===== 6. EXPORT =====
    console.log('\n─── 6. EXPORT ───');
    await page.goto(FRONTEND + `/campaigns/${campaignId}/export`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Export Formats');
    await page.screenshot({ path: `${SHOTS}/10-export.png`, fullPage: true });
    await page.getByTestId('export-btn').click();
    let exported = false;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      const ready = await page.locator('.toast.success').filter({ hasText: 'ready' }).count();
      if (ready > 0) { exported = true; break; }
    }
    check('EXPORT: packaging completes with success toast', exported);
    await sleep(800);
    const dlBtn = await page.locator('button').filter({ hasText: 'Download' }).count();
    check('EXPORT: download button appears in history', dlBtn > 0, `buttons=${dlBtn}`);
    await page.screenshot({ path: `${SHOTS}/11-export-done.png`, fullPage: true });

    // ===== 7. HISTORY =====
    console.log('\n─── 7. HISTORY ───');
    await page.goto(FRONTEND + '/history', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1');
    await sleep(1000);
    const rows = await page.locator('table.tbl tbody tr').count();
    check('HISTORY: campaign row appears', rows >= 1, `rows=${rows}`);
    const statusBadge = (await page.locator('table.tbl .badge').first().textContent()) || '';
    check('HISTORY: status badge renders', !!statusBadge.trim(), `badge="${statusBadge.trim()}"`);
    await page.screenshot({ path: `${SHOTS}/12-history.png`, fullPage: true });

    // Search → empty
    await page.fill('input[placeholder*="Search"]', 'NonExistentXYZ');
    await page.getByRole('button', { name: 'Search' }).click();
    await sleep(700);
    const emptyAfterSearch = await page.locator('.empty-state').count();
    check('HISTORY: search "no results" empty state works', emptyAfterSearch > 0);
    await page.screenshot({ path: `${SHOTS}/13-history-search-empty.png`, fullPage: true });

    // ===== 8. RESPONSIVE 375px =====
    console.log('\n─── 8. RESPONSIVE (375px) ───');
    await page.goto(FRONTEND + '/', { waitUntil: 'networkidle' });
    await page.setViewportSize({ width: 375, height: 812 });
    await sleep(700);
    const menuVisible = await page.locator('.menu-toggle').isVisible();
    check('RESPONSIVE: hamburger menu visible at 375px', menuVisible);
    await page.locator('.menu-toggle').click();
    await sleep(500);
    const sidebarOpen = await page.locator('.sidebar.open').count();
    check('RESPONSIVE: sidebar drawer opens on mobile', sidebarOpen > 0);
    await page.screenshot({ path: `${SHOTS}/14-mobile-dashboard.png`, fullPage: true });

    // Editor single column
    await page.goto(FRONTEND + `/campaigns/${campaignId}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.editor-wrap');
    await sleep(700);
    const cols = await page.evaluate(() => window.getComputedStyle(document.querySelector('.editor-wrap')).gridTemplateColumns);
    // Computed value resolves 1fr to px (e.g. "343px"); a single column = no space in the string.
    const isSingleColumn = cols.trim().indexOf(' ') === -1;
    check('RESPONSIVE: editor collapses to single column at 375px', isSingleColumn, `cols="${cols}"`);
    await page.screenshot({ path: `${SHOTS}/15-mobile-editor.png`, fullPage: true });

    // ===== 9. NETWORK FAILURE (scoped: only campaign listing fails, keep session) =====
    console.log('\n─── 9. NETWORK FAILURE ───');
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(FRONTEND + '/history', { waitUntil: 'networkidle' });
    await sleep(500);
    // Intercept only the campaigns list endpoint -> 500, leave refresh working so the
    // session stays valid and the History screen can render its error banner.
    await ctx.route('**/api/campaigns?**', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Failed to load campaigns' } }) }),
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await sleep(1800);
    const errBanner = await page.locator('.error-banner').count();
    check('NETWORK-FAIL: error banner shown when API down', errBanner > 0, `banners=${errBanner}`);
    // Verify a Retry button is present (Section 2.5 Error state)
    const retryBtn = await page.locator('.error-banner button').count();
    check('NETWORK-FAIL: Retry button present in error state', retryBtn > 0, `retry buttons=${retryBtn}`);
    await page.screenshot({ path: `${SHOTS}/16-network-error.png`, fullPage: true });
    await ctx.unroute('**/api/campaigns?**');

    // ===== 10. CONSOLE =====
    console.log('\n─── 10. CONSOLE CLEANLINESS ───');
    const realErrors = consoleErrors.filter(
      (e) => !e.includes('Failed to load resource') && !/401|403/.test(e) && !e.includes('net::ERR'),
    );
    check('CONSOLE: no unexpected JS errors', realErrors.length === 0, `errors=${JSON.stringify(realErrors).slice(0, 200)}`);

  } catch (err) {
    console.error('\n💥 HARNESS ERROR:', err.message);
    await page.screenshot({ path: `${SHOTS}/ERROR.png`, fullPage: true }).catch(() => {});
    check('HARNESS: completed without crashing', false, err.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${'='.repeat(60)}\nREAL BROWSER E2E: ${passed}/${total} checks PASSED\n${'='.repeat(60)}`);
  process.exitCode = passed === total ? 0 : 1;
})();
