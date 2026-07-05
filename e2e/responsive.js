// ============================================================================
// RESPONSIVE E2E — verifies the app adapts across 8 viewport widths with NO
// horizontal overflow at any size. Captures a screenshot per breakpoint.
// ============================================================================
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FRONTEND = 'http://localhost:5173';
const SHOTS = path.join(__dirname, 'screenshots', 'responsive');
fs.mkdirSync(SHOTS, { recursive: true });

const email = `resp_${Date.now()}@example.com`;
const password = 'RealPass123!';
const licenseKey = 'ALK-DEMO-TEST-0001-0001';

// Viewports to test: small phone -> ultra-wide desktop
const VIEWPORTS = [
  { name: 'iphone-se',     w: 320, h: 568 },   // smallest common phone
  { name: 'iphone-12',     w: 390, h: 844 },   // modern phone
  { name: 'pixel-large',   w: 414, h: 896 },   // large android
  { name: 'ipad-mini',     w: 768, h: 1024 },  // portrait tablet
  { name: 'ipad-landscape',w: 1024, h: 768 },  // landscape tablet / small laptop
  { name: 'laptop',        w: 1280, h: 800 },  // standard laptop
  { name: 'desktop',       w: 1536, h: 864 },  // desktop
  { name: 'ultrawide',     w: 1920, h: 1080 }, // large monitor
];

const results = [];
function check(name, cond, detail) {
  const ok = !!cond;
  results.push({ name, ok, detail: detail || '' });
  console.log(`${ok ? '✅' : '❌'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Measures horizontal overflow: how many pixels of content exceed the viewport.
async function overflowPx(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }));
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // ---- One-time setup: register + activate license + create a campaign ----
  console.log('─── setup: account + campaign ───');
  await page.goto(FRONTEND + '/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([page.waitForURL('**/', { timeout: 15000 }), page.getByTestId('auth-submit').click()]);
  await page.goto(FRONTEND + '/account', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder*="ALK"]', licenseKey);
  await page.getByTestId('activate-btn').click();
  await sleep(1000);
  await page.goto(FRONTEND + '/campaigns/new', { waitUntil: 'networkidle' });
  await page.fill('#pn', 'Responsive Demo Product');
  await page.fill('#aud', 'marketers');
  await Promise.all([page.waitForURL(/\/campaigns\/[a-f0-9-]+$/, { timeout: 60000 }), page.getByTestId('generate-btn').click()]);
  await page.waitForSelector('.tabs', { timeout: 15000 });
  await sleep(2000);
  const campaignId = page.url().split('/campaigns/')[1];
  console.log('   campaign ready:', campaignId, '\n');

  // Screens to validate at each viewport
  const SCREENS = [
    { label: 'login',    url: FRONTEND + '/login' },
    { label: 'dashboard',url: FRONTEND + '/' },
    { label: 'editor',   url: FRONTEND + '/campaigns/' + campaignId },
    { label: 'export',   url: FRONTEND + '/campaigns/' + campaignId + '/export' },
    { label: 'history',  url: FRONTEND + '/history' },
  ];

  for (const vp of VIEWPORTS) {
    console.log(`\n═══ ${vp.name} (${vp.w}×${vp.h}) ═══`);
    await ctx.newPage().then(async (np) => { await np.close(); }); // noop safety
    await page.setViewportSize({ width: vp.w, height: vp.h });

    for (const screen of SCREENS) {
      await page.goto(screen.url, { waitUntil: 'networkidle' });
      await sleep(700);
      const ov = await overflowPx(page);
      const overflow = ov.scrollWidth - ov.clientWidth;
      const ok = overflow <= 2; // tolerate 2px rounding
      check(`${vp.name}/${screen.label}: no horizontal overflow`, ok,
        !ok ? `overflow=${overflow}px (scroll=${ov.scrollWidth} client=${ov.clientWidth})` : '');
      await page.screenshot({ path: `${SHOTS}/${vp.name}-${screen.label}.png`, fullPage: false });
    }

    // Device-class-specific behavioral checks
    if (vp.w < 768) {
      // Mobile: hamburger must be visible, sidebar hidden until toggled
      await page.goto(FRONTEND + '/', { waitUntil: 'networkidle' });
      await sleep(500);
      const menuVisible = await page.locator('.menu-toggle').isVisible().catch(() => false);
      check(`${vp.name}: mobile hamburger visible`, menuVisible);
      // Editor: pane toggle visible (Edit/Preview switch)
      await page.goto(FRONTEND + '/campaigns/' + campaignId, { waitUntil: 'networkidle' });
      await page.waitForSelector('.editor-wrap');
      await sleep(600);
      const toggleVisible = await page.locator('.pane-toggle:visible').count();
      check(`${vp.name}: editor Edit/Preview toggle visible`, toggleVisible > 0, `toggle=${toggleVisible}`);
    } else {
      // Tablet/desktop: sidebar persistent (no hamburger), editor dual-pane
      await page.goto(FRONTEND + '/', { waitUntil: 'networkidle' });
      await sleep(500);
      const menuHidden = !(await page.locator('.menu-toggle').isVisible().catch(() => false));
      check(`${vp.name}: desktop — no hamburger (sidebar persistent)`, menuHidden);
      await page.goto(FRONTEND + '/campaigns/' + campaignId, { waitUntil: 'networkidle' });
      await page.waitForSelector('.editor-wrap');
      await sleep(600);
      const cols = await page.evaluate(() => window.getComputedStyle(document.querySelector('.editor-wrap')).gridTemplateColumns);
      const dual = cols.trim().indexOf(' ') > 0;
      check(`${vp.name}: editor dual-pane (side by side)`, dual, `cols="${cols}"`);
    }
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${'='.repeat(60)}\nRESPONSIVE E2E: ${passed}/${total} PASSED across ${VIEWPORTS.length} devices\n${'='.repeat(60)}`);
  console.log(`Screenshots: ${SHOTS}/`);
  process.exitCode = passed === total ? 0 : 1;
})();
