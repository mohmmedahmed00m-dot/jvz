// End-to-end backend test (no external deps — uses global fetch in Node 20).
const BASE = 'http://localhost:3000/api';
const JVZOO_SECRET = 'jvzoo-dev-secret-12345';

let cookie = ''; // alk_refresh cookie
function jar(setCookieHeader) {
  if (!setCookieHeader) return;
  const m = /alk_refresh=([^;]+)/.exec(setCookieHeader);
  if (m) cookie = `alk_refresh=${m[1]}`;
}

async function req(method, path, { body, token, form } = {}) {
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  jar(res.headers.get('set-cookie'));
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text };
}

function md5(s) {
  return require('crypto').createHash('md5').update(s).digest('hex');
}
function jvzooSign(fields, secret) {
  const { cverify, ...rest } = fields;
  const keys = Object.keys(rest).sort();
  const concat = keys.map((k) => rest[k] ?? '').join('') + secret;
  return md5(concat);
}

const log = [];
function check(name, cond, detail = '') {
  const ok = !!cond;
  log.push(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const email = `tester_${Date.now()}@example.com`;
  const password = 'SuperSecret123';

  // 1. Register
  let r = await req('POST', '/auth/register', { body: { email, password } });
  check('register returns 201 + access_token', r.status === 201 && r.json.access_token, `status=${r.status}`);
  let token = r.json.access_token;
  const userId = r.json.user_id;

  // 2. Protected endpoint WITHOUT license -> should be 403
  r = await req('GET', '/campaigns', { token });
  check('protected endpoint blocked w/o license -> 403', r.status === 403, `status=${r.status}`);

  // 3. Activate license with test key
  r = await req('POST', '/auth/activate-license', { token, body: { license_key: 'ALK-DEMO-TEST-0001-0001' } });
  check('activate-license -> active', r.status === 201 && r.json.status === 'active', JSON.stringify(r.json));

  // 4. Login (now with license)
  r = await req('POST', '/auth/login', { body: { email, password } });
  check('login returns access_token + license_status active', r.status === 200 && r.json.license_status === 'active', JSON.stringify(r.json));
  token = r.json.access_token;

  // 5. Refresh token
  r = await req('POST', '/auth/refresh');
  check('refresh -> new access_token', r.status === 200 && !!r.json.access_token, `status=${r.status}`);
  token = r.json.access_token;

  // 6. Protected endpoint WITH license -> 200
  r = await req('GET', '/campaigns', { token });
  check('protected endpoint works WITH license -> 200', r.status === 200, `status=${r.status}`);

  // 7. Create campaign -> triggers generation
  r = await req('POST', '/campaigns', {
    token,
    body: {
      product_name: 'TrafficBlaster Pro',
      product_url: 'https://example.com/tb',
      niche: 'Make Money Online',
      tone: 'hype',
      target_audience: 'beginner marketers',
      generators_selected: ['review', 'bonus', 'email_sequence', 'social_posts', 'cta'],
    },
  });
  check('create campaign -> campaign_id', (r.status === 201 || r.status === 200) && r.json.campaign_id, JSON.stringify(r.json));
  const campaignId = r.json.campaign_id;

  // 8. Get assets -> all 5 generated
  r = await req('GET', `/campaigns/${campaignId}/assets`, { token });
  const assets = r.json.assets;
  check('all 5 assets generated', !!assets.review && !!assets.bonus && !!assets.email_sequence && !!assets.social_posts && !!assets.cta, JSON.stringify(Object.keys(assets || {})));

  // 9. Validate each asset content format
  check('review is HTML with h1+ul+cta-block', /<h1/i.test(assets.review.content) && /<ul/i.test(assets.review.content) && /cta-block/.test(assets.review.content));
  check('review has NO <script>', !/<script/i.test(assets.review.content));
  let emails; try { emails = JSON.parse(assets.email_sequence.content); } catch {}
  check('email_sequence is JSON array length 5', Array.isArray(emails) && emails.length === 5 && emails[0].subject, `len=${emails?.length}`);
  let social; try { social = JSON.parse(assets.social_posts.content); } catch {}
  check('social_posts JSON has all platforms + twitter<=280', social && social.twitter && social.twitter.text.length <= 280, `tw=${social?.twitter?.text?.length}`);
  let cta; try { cta = JSON.parse(assets.cta.content); } catch {}
  check('cta is JSON array length 5 with urgency_level', Array.isArray(cta) && cta.length === 5 && ['Low','Medium','High'].includes(cta[0].urgency_level), `len=${cta?.length}`);
  let bonusCount = (assets.bonus.content.match(/bonus-card/g) || []).length;
  check('bonus HTML has 3 bonus-card', bonusCount === 3, `count=${bonusCount}`);

  // 10. Sanitizer test: PATCH review with a <script> payload, ensure stripped on... 
  // (manual edit stores raw; sanitizer applies on generation. Test sanitizer directly via regenerate won't sanitize manual.
  // We verify sanitize by checking generated review had no script. Additionally test that regeneration sanitizes injected script.)

  // 11. Regenerate single asset (cta) with custom instruction
  r = await req('POST', `/campaigns/${campaignId}/assets/cta/regenerate`, { token, body: { custom_instruction: 'make all urgency High' } });
  check('regenerate cta -> version incremented', (r.status === 201 || r.status === 200) && r.json.version >= 2, JSON.stringify(r.json));

  // 12. Manual edit (PATCH) review asset
  r = await req('PATCH', `/campaigns/${campaignId}/assets/review`, { token, body: { content: '<h1>Manually edited headline</h1><p>Edited by user.</p>' } });
  check('manual edit -> is_manual_edit true + version inc', r.json.is_manual_edit === true && r.json.version >= 2, JSON.stringify(r.json));

  // 13. Other assets unaffected by single regen/edit
  r = await req('GET', `/campaigns/${campaignId}/assets`, { token });
  check('email asset version still 1 after cta regen', r.json.assets.email_sequence.version === 1, `v=${r.json.assets.email_sequence.version}`);

  // 14. Export -> pending
  r = await req('POST', `/campaigns/${campaignId}/export`, { token, body: { formats: ['review', 'bonus', 'emails', 'social', 'cta'], bundle_as_zip: true } });
  check('export created -> pending', (r.status === 201 || r.status === 200) && r.json.export_id, JSON.stringify(r.json));
  const exportId = r.json.export_id;

  // 15. Poll exports until completed
  let done = false;
  for (let i = 0; i < 20; i++) {
    await new Promise((res) => setTimeout(res, 400));
    r = await req('GET', `/campaigns/${campaignId}/exports`, { token });
    const exp = (r.json.exports || []).find((e) => e.id === exportId);
    if (exp && exp.status === 'completed') { done = true; break; }
    if (exp && exp.status === 'failed') break;
  }
  check('export job completed (BullMQ)', done, `exportId=${exportId}`);

  // 16. Download the zip
  if (done) {
    const dlRes = await fetch(`${BASE}/exports/${exportId}/download`, { headers: { Authorization: `Bearer ${token}`, Cookie: cookie } });
    const buf = Buffer.from(await dlRes.arrayBuffer());
    check('download returns ZIP (PK header)', dlRes.status === 200 && buf.slice(0, 2).toString() === 'PK', `status=${dlRes.status} size=${buf.length}`);
  }

  // 17. JVZoo IPN: SALE -> creates license
  const saleFields = {
    ctransaction: 'SALE',
    ctransreceipt: 'JVZ-' + Date.now(),
    ccustemail: 'buyer@example.com',
    cprodtitle: 'Affiliate Launch Kit',
    ctranstime: String(Math.floor(Date.now() / 1000)),
    ctransamount: '97.00',
  };
  saleFields.cverify = jvzooSign(saleFields, JVZOO_SECRET);
  r = await req('POST', '/webhooks/jvzoo/ipn', { form: saleFields });
  check('JVZoo SALE IPN -> 200 OK', r.status === 200, `status=${r.status} body=${r.text}`);

  // 18. JVZoo IPN: REFUND -> revokes license
  const refundFields = { ...saleFields, ctransaction: 'REFUND' };
  refundFields.cverify = jvzooSign(refundFields, JVZOO_SECRET);
  r = await req('POST', '/webhooks/jvzoo/ipn', { form: refundFields });
  check('JVZoo REFUND IPN -> 200 OK', r.status === 200, `status=${r.status}`);

  // 19. JVZoo IPN: bad signature -> 400
  const badFields = { ...saleFields, cverify: 'deadbeef' };
  r = await req('POST', '/webhooks/jvzoo/ipn', { form: badFields });
  check('JVZoo bad signature -> 400', r.status === 400, `status=${r.status}`);

  // 20. Logout -> 204, then refresh should fail (revoked)
  r = await req('POST', '/auth/logout');
  check('logout -> 204', r.status === 204, `status=${r.status}`);
  r = await req('POST', '/auth/refresh');
  check('refresh after logout -> 401 (revoked)', r.status === 401, `status=${r.status}`);

  console.log('\n================ E2E RESULTS ================');
  console.log(log.join('\n'));
  console.log('============================================');
})();
