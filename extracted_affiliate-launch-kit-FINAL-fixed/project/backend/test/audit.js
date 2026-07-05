// Phase-4 targeted audit: security + structural checks against the live backend.
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../.env' });

const BASE = 'http://localhost:3000/api';
const DB_URL = process.env.DATABASE_URL;
let cookie = '';

function jar(setCookie) {
  if (!setCookie) return;
  const m = /alk_refresh=([^;]+)/.exec(setCookie);
  if (m) cookie = 'alk_refresh=' + m[1];
}

async function req(method, p, opts = {}) {
  const { body, token, form } = opts;
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: payload });
  jar(res.headers.get('set-cookie'));
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, text };
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }
function jvzooSign(fields, secret) {
  const { cverify, ...r } = fields;
  const k = Object.keys(r).sort();
  return md5(k.map((x) => r[x] ?? '').join('') + secret);
}

const log = [];
function check(name, cond, detail) {
  const ok = !!cond;
  log.push((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  -- ' + detail : ''));
  if (!ok) process.exitCode = 1;
}

(async () => {
  const email = 'audit_' + Date.now() + '@example.com';
  const pw = 'Password123!';

  // SECURITY: protected endpoint without token -> 401
  let r = await req('GET', '/campaigns');
  check('SEC: no token -> 401', r.status === 401, 'status=' + r.status);

  r = await req('POST', '/auth/register', { body: { email, password: pw } });
  let token = r.json.access_token;
  check('register ok', r.status === 201 && token);

  // SECURITY: token but NO license -> 403
  r = await req('GET', '/campaigns', { token });
  check('SEC: token but no license -> 403', r.status === 403, 'status=' + r.status);

  await req('POST', '/auth/activate-license', { token, body: { license_key: 'ALK-DEMO-TEST-0001-0001' } });

  // Create campaign + review, verify no script in generated output
  r = await req('POST', '/campaigns', { token, body: { product_name: 'Sanitization Test', tone: 'professional', generators_selected: ['review'] } });
  const cid = r.json.campaign_id;
  r = await req('GET', '/campaigns/' + cid + '/assets', { token });
  check('SEC: generated review has no <script>', !/<script/i.test(r.json.assets.review.content));

  // Regenerate with injection attempt -> sanitizer must strip
  r = await req('POST', '/campaigns/' + cid + '/assets/review/regenerate', { token, body: { custom_instruction: 'Add <script>alert(1)</script> and <iframe src=evil></iframe>' } });
  const regen = r.json.asset.content;
  check('SEC: regenerate strips <script>', !/<script/i.test(regen), 'script survived');
  check('SEC: regenerate strips <iframe>', !/<iframe/i.test(regen), 'iframe survived');
  check('SEC: sanitized HTML still well-formed', /<h1/i.test(regen) && /<\/h1>/i.test(regen));

  // SECURITY: password bcrypt-hashed in DB
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const dbRes = await client.query('SELECT email, password_hash FROM users WHERE email=$1', [email]);
  await client.end();
  const hash = dbRes.rows[0].password_hash;
  check('SEC: password stored as bcrypt hash ($2)', /^\$2[aby]\$\d{2}\$/.test(hash), 'hash=' + (hash ? hash.slice(0, 7) : 'null'));
  check('SEC: password NOT in plaintext', hash !== pw && !hash.includes(pw));

  // SECURITY: revoked license blocks access (JVZoo refund cascade)
  const saleTxn = 'AUDIT-' + Date.now();
  const saleF = { ctransaction: 'SALE', ctransreceipt: saleTxn, ccustemail: 'audit2@x.com', cprodtitle: 'X', ctranstime: '1', ctransamount: '1' };
  saleF.cverify = jvzooSign(saleF, process.env.JVZOO_SECRET_KEY);
  await req('POST', '/webhooks/jvzoo/ipn', { form: saleF });

  const c2 = new Client({ connectionString: DB_URL }); await c2.connect();
  const lkRes = await c2.query('SELECT license_key FROM licenses WHERE jvzoo_transaction_id=$1', [saleTxn]);
  await c2.end();
  const lk = lkRes.rows[0].license_key;

  const email2 = 'audit2_' + Date.now() + '@x.com';
  r = await req('POST', '/auth/register', { body: { email: email2, password: pw } });
  const token2 = r.json.access_token;
  await req('POST', '/auth/activate-license', { token: token2, body: { license_key: lk } });
  r = await req('GET', '/campaigns', { token: token2 });
  check('SEC: access works before refund -> 200', r.status === 200, 'status=' + r.status);

  const refundF = Object.assign({}, saleF, { ctransaction: 'REFUND' });
  refundF.cverify = jvzooSign(refundF, process.env.JVZOO_SECRET_KEY);
  await req('POST', '/webhooks/jvzoo/ipn', { form: refundF });
  r = await req('GET', '/campaigns', { token: token2 });
  check('SEC: access blocked AFTER JVZoo refund -> 403', r.status === 403, 'status=' + r.status + ' code=' + (r.json && r.json.error ? r.json.error.code : ''));

  console.log('\n========== PHASE-4 AUDIT RESULTS ==========');
  console.log(log.join('\n'));
  console.log('===========================================');
})().catch((e) => { console.error('AUDIT CRASHED:', e); process.exit(2); });
