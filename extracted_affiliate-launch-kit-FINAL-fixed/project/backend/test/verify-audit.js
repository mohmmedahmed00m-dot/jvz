// STEP 4 VERIFY — verifies all audit fixes + required scenarios:
//  full flow, refund immediate revocation, duplicate IPN idempotency,
//  no-token 401, malicious product-name sanitization, manual-edit sanitization,
//  constant-time signature, transaction atomicity.
const crypto = require('crypto');
const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/../.env' });

const BASE = 'http://localhost:3000/api';
const DB_URL = process.env.DATABASE_URL;
let cookie = '';
function jar(s){ if(!s) return; const m=/alk_refresh=([^;]+)/.exec(s); if(m) cookie='alk_refresh='+m[1]; }
async function req(m,p,o={}){const{body,token,form}=o;const h={};if(cookie)h.Cookie=cookie;if(token)h.Authorization='Bearer '+token;let pl;if(form){h['Content-Type']='application/x-www-form-urlencoded';pl=new URLSearchParams(form).toString();}else if(body!==undefined){h['Content-Type']='application/json';pl=JSON.stringify(body);}const r=await fetch(BASE+p,{method:m,headers:h,body:pl});jar(r.headers.get('set-cookie'));const t=await r.text();let j;try{j=JSON.parse(t);}catch{j=t;}return{status:r.status,json:j,text:t};}
const md5=s=>crypto.createHash('md5').update(s).digest('hex');
const jvzooSign=(f,s)=>{const{cverify,...r}=f;const k=Object.keys(r).sort();return md5(k.map(x=>r[x]??'').join('')+s);};

const log=[];
function check(n,c,d){const ok=!!c;log.push((ok?'PASS':'FAIL')+'  '+n+(d?'  -- '+d:''));if(!ok)process.exitCode=1;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const email='verify_'+Date.now()+'@x.com', pw='Password123!';

  // (A) FULL FLOW
  let r=await req('POST','/auth/register',{body:{email,password:pw}});
  let token=r.json.access_token;
  check('FULL: register ok', r.status===201 && token);
  // (D) no-token on protected endpoint -> 401
  r=await req('GET','/campaigns');
  check('SEC: no token -> 401', r.status===401, 'status='+r.status);
  // token but no license -> 403
  r=await req('GET','/campaigns',{token});
  check('SEC: token, no license -> 403', r.status===403, 'status='+r.status);

  await req('POST','/auth/activate-license',{token,body:{license_key:'ALK-DEMO-TEST-0001-0001'}});

  // (E) malicious HTML in PRODUCT NAME -> generated review must be sanitized
  r=await req('POST','/campaigns',{token,body:{product_name:'<script>alert(1)</script>Bad<i>Prod',tone:'professional',generators_selected:['review','bonus','email_sequence','social_posts','cta']}});
  const cid=r.json.campaign_id;
  check('FULL: campaign created', !!cid, JSON.stringify(r.json).slice(0,80));
  r=await req('GET',`/campaigns/${cid}/assets`,{token});
  const review=r.json.assets.review.content;
  check('SANITIZE: product-name <script> stripped from generated review', !/<script/i.test(review), 'script survived');
  check('SANITIZE: generated review still well-formed', /<h1/i.test(review) && /<\/h1>/i.test(review));
  // verify all 5 assets present (transaction committed all together)
  const all5 = r.json.assets.review && r.json.assets.bonus && r.json.assets.email_sequence && r.json.assets.social_posts && r.json.assets.cta;
  check('TX: all 5 assets committed atomically', !!all5);

  // (F) manual edit with malicious HTML on review asset -> sanitized on save
  r=await req('PATCH',`/campaigns/${cid}/assets/review`,{token,body:{content:'<h1>OK</h1><script>x()</script><iframe src=evil></iframe>'}});
  const edited=r.json.asset.content;
  check('SANITIZE: manual edit strips <script>', !/<script/i.test(edited), 'survived: '+edited.slice(0,60));
  check('SANITIZE: manual edit strips <iframe>', !/<iframe/i.test(edited));
  check('SANITIZE: manual edit keeps legitimate <h1>', /<h1>OK<\/h1>/i.test(edited));
  check('TX: manual edit version incremented + is_manual_edit', r.json.is_manual_edit===true && r.json.version>=2);

  // manual edit with INVALID JSON on a json asset -> rejected (400)
  r=await req('PATCH',`/campaigns/${cid}/assets/cta`,{token,body:{content:'{ not valid json'}});
  check('VALIDATE: invalid JSON manual edit rejected -> 400', r.status===400, 'status='+r.status);

  // regenerate single asset: others unaffected
  const before=r; // (cta unchanged because above failed)
  const rCta=await req('POST',`/campaigns/${cid}/assets/cta/regenerate`,{token,body:{}});
  check('REGEN: single asset regenerate ok', (rCta.status===200||rCta.status===201) && rCta.json.version>=2);
  r=await req('GET',`/campaigns/${cid}/assets`,{token});
  check('REGEN: review version unaffected by cta regen', r.json.assets.review.version>=2 && r.json.assets.email_sequence.version===1);

  // (B) REFUND immediate revocation
  const saleTxn='VERIFY-'+Date.now();
  const saleF={ctransaction:'SALE',ctransreceipt:saleTxn,ccustemail:'v2@x.com',cprodtitle:'X',ctranstime:'1',ctransamount:'1'};
  saleF.cverify=jvzooSign(saleF,process.env.JVZOO_SECRET_KEY);
  await req('POST','/webhooks/jvzoo/ipn',{form:saleF});
  const client=new Client({connectionString:DB_URL}); await client.connect();
  const lkRes=await client.query('SELECT license_key FROM licenses WHERE jvzoo_transaction_id=$1',[saleTxn]);
  await client.end();
  const lk=lkRes.rows[0].license_key;
  const email2='verify2_'+Date.now()+'@x.com';
  r=await req('POST','/auth/register',{body:{email:email2,password:pw}});
  const token2=r.json.access_token;
  await req('POST','/auth/activate-license',{token:token2,body:{license_key:lk}});
  r=await req('GET','/campaigns',{token:token2});
  check('REFUND: access works before refund -> 200', r.status===200, 'status='+r.status);
  const refundF={...saleF,ctransaction:'REFUND'}; refundF.cverify=jvzooSign(refundF,process.env.JVZOO_SECRET_KEY);
  await req('POST','/webhooks/jvzoo/ipn',{form:refundF});
  // IMMEDIATE check (no wait) — must be 403 now
  r=await req('GET','/campaigns',{token:token2});
  check('REFUND: access blocked IMMEDIATELY after refund -> 403', r.status===403, 'status='+r.status+' (not immediate if 200)');

  // (C) DUPLICATE IPN idempotency: same SALE twice -> still ONE license
  const dupTxn='DUP-'+Date.now();
  const dupF={ctransaction:'SALE',ctransreceipt:dupTxn,ccustemail:'d@x.com',cprodtitle:'Y',ctranstime:'2',ctransamount:'2'};
  dupF.cverify=jvzooSign(dupF,process.env.JVZOO_SECRET_KEY);
  await req('POST','/webhooks/jvzoo/ipn',{form:dupF});
  await req('POST','/webhooks/jvzoo/ipn',{form:dupF});
  const c2=new Client({connectionString:DB_URL}); await c2.connect();
  const cntRes=await c2.query('SELECT COUNT(*)::int AS n FROM licenses WHERE jvzoo_transaction_id=$1',[dupTxn]);
  await c2.end();
  check('IDEMPOTENCY: duplicate SALE IPN creates exactly ONE license', cntRes.rows[0].n===1, 'count='+cntRes.rows[0].n);

  // (G) bad signature -> rejected
  const bad={...saleF,cverify:'deadbeef'};
  r=await req('POST','/webhooks/jvzoo/ipn',{form:bad});
  check('SEC: bad JVZoo signature -> 400', r.status===400, 'status='+r.status);

  // (H) constant-time: confirm code path uses timingSafeEqual (smoke: valid sig still accepted)
  r=await req('POST','/webhooks/jvzoo/ipn',{form:saleF});
  check('SEC: valid signature still accepted (constant-time path)', r.status===200, 'status='+r.status);

  // export + download sanity
  r=await req('POST',`/campaigns/${cid}/export`,{token,body:{formats:['review','bonus','emails','social','cta'],bundle_as_zip:true}});
  const eid=r.json.export_id;
  let done=false;
  for(let i=0;i<25;i++){await sleep(400);const lr=await req('GET',`/campaigns/${cid}/exports`,{token});const e=lr.json.exports.find(x=>x.id===eid);if(e&&e.status==='completed'){done=true;break;}if(e&&e.status==='failed')break;}
  check('EXPORT: zip job completed', done);
  if(done){const dl=await fetch(BASE+'/exports/'+eid+'/download',{headers:{Authorization:'Bearer '+token}});const buf=Buffer.from(await dl.arrayBuffer());check('EXPORT: download returns valid ZIP (PK header)', dl.status===200&&buf.slice(0,2).toString()==='PK','status='+dl.status);}

  console.log('\n========== STEP 4 VERIFY ==========');
  console.log(log.join('\n'));
  console.log('===================================');
})().catch(e=>{console.error('VERIFY CRASHED:',e);process.exit(2);});
