import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import worker from '../src/index.js';
import { createD1 } from './d1.js';
import { BODY_TIMEOUT_MS } from '../src/security.js';

const DB = createD1();
const local = { DB, LOCAL_DEV: 'true', ADMIN_TOKEN: 'synthetic-local-admin-key-with-more-than-32-characters' };
const apiOrigin = 'https://api.test.workers.dev';
const adminOrigin = 'https://admin.example.test';
const limits = ['INGRESS_LIMITER', 'AUTH_LIMITER', 'REGISTRATION_LIMITER', 'REPORTER_LIMITER', 'ADMIN_LIMITER', 'DB_LIMITER'];
const limitCalls = [];
const prod = {
  DB, API_ORIGIN: apiOrigin, ADMIN_ORIGIN: adminOrigin,
  ACCESS_TEAM_DOMAIN: 'https://tc-security-test.cloudflareaccess.com', ACCESS_AUD: 'tc-security-test',
  ADMIN_EMAILS: 'owner@example.test', EXTENSION_IDS: 'a'.repeat(32),
  ...Object.fromEntries(limits.map(name => [name, { async limit({key}) { limitCalls.push({name,key}); return {success:true}; } }])),
};
async function call(path, {env = local, method = 'GET', body, token, headers = {}, origin, stream} = {}) {
  const admin = path === '/admin' || path.startsWith('/api/admin/');
  const base = origin || (env.LOCAL_DEV === 'true' ? 'http://localhost:8787' : admin ? adminOrigin : apiOrigin);
  const request = new Request(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(admin && method === 'POST' ? {Origin:base,'X-TC-Admin-Action':'1'} : {}),
      ...(token ? {Authorization:'Bearer '+token} : {}), ...headers },
    ...(stream ? {body:stream,duplex:'half'} : body !== undefined ? {body:JSON.stringify(body)} : {}),
  });
  const response = await worker.fetch(request, env);
  const text = await response.text();
  return {status:response.status,headers:response.headers,text,data:response.headers.get('Content-Type')?.includes('application/json') ? JSON.parse(text) : null};
}
const admin = (path, body) => call('/api/admin/' + path, {method:body ? 'POST':'GET',body,token:local.ADMIN_TOKEN});
const sample = {channel_handle:'@securitytest',channel_name:'Security test',reason:'Synthetic test report'};
const register = (token='',options={}) => call('/api/register',{method:'POST',body:{},token,...options});
let issued = (await register()).data;
const report = (token, body=sample, options={}) => call('/api/reports',{method:'POST',token,body,...options});
assert.match(issued.token,/^tcr_[A-Za-z0-9_-]{43}$/);
assert.ok(issued.expires_at > Date.now()/1000 + 364 * 86400);
assert.equal((await report(issued.token)).status,201);
const renewed = (await register(issued.token)).data;
assert.equal(renewed.reporter_id,issued.reporter_id);
assert.equal(renewed.token,issued.token);
assert.equal((await report(issued.token)).data.duplicate,true, 'Anonymous renewal never creates a second identity/vote');
assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM community_reports').get().n,1);
DB.sqlite.prepare('UPDATE reporter_credentials SET expires_at = 0 WHERE reporter_id = ?').run(issued.reporter_id);
assert.equal((await report(issued.token)).status,401);
assert.equal((await register(issued.token)).status,200);
DB.sqlite.prepare('DELETE FROM reporter_credentials WHERE reporter_id = ?').run(issued.reporter_id);
assert.equal((await report(issued.token)).status,401, 'Legacy credentials without expiry are not accepted');
assert.equal((await register(issued.token)).status,200);
await admin('reporters/'+issued.reporter_id+'/revoke',{});
assert.equal((await report(issued.token)).status,401);
assert.equal((await register(issued.token)).status,403);
issued = (await register()).data;
assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM security_audit WHERE actor = 'local-admin'").get().n,1);

// Origin checks are independent of authentication; CORS is not used as authorization.
assert.equal((await call('/api/admin/reporters',{method:'POST',body:{label:'bad'},token:local.ADMIN_TOKEN,headers:{Origin:'https://evil.example'}})).status,403);
assert.equal((await call('/api/admin/reporters',{method:'POST',body:{label:'bad'},token:local.ADMIN_TOKEN,headers:{'X-TC-Admin-Action':'0'}})).status,403);
assert.equal((await call('/api/admin/reporters',{method:'POST',body:{label:'bad'},token:local.ADMIN_TOKEN,headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
assert.equal((await call('/api/admin/channels/%zz',{method:'POST',body:{status:'approved',note:'test'},token:local.ADMIN_TOKEN})).status,400);
assert.equal((await call('/api/admin/channels?status=pending&status=approved',{token:local.ADMIN_TOKEN})).status,400);

// Body size is bounded in bytes even without (or with a lying) Content-Length.
const fakeToken = 'tcr_' + 'a'.repeat(43);
assert.equal((await report(fakeToken,sample,{headers:{'Content-Length':'20000'}})).status,413);
assert.equal((await report(fakeToken,{...sample,reason:'文'.repeat(6000)})).status,413);
assert.equal((await report(fakeToken,sample,{headers:{'Content-Type':'text/plain'}})).status,415);
assert.equal((await report(fakeToken,sample,{headers:{'Content-Encoding':'gzip'}})).status,415);
let cancelled = false;
const large = new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(9000));},cancel(){cancelled=true;}});
assert.equal((await call('/api/reports',{method:'POST',token:fakeToken,stream:large,headers:{'Content-Length':'1'}})).status,413);
assert.equal(cancelled,true);
const slow = new ReadableStream({pull(){return new Promise(()=>{});}});
const started = Date.now();
assert.equal((await call('/api/reports',{method:'POST',token:fakeToken,stream:slow})).status,408);
assert.ok(Date.now()-started < BODY_TIMEOUT_MS + 2000);
assert.equal((await report(issued.token,null)).status,400);
assert.equal((await report(issued.token,{...sample,channel_handle:"@a'; DROP TABLE reporters;--"})).status,400);
assert.ok(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM reporters').get().n);

// Public deployment cannot fall back to dev config, a bearer admin key or an email header.
assert.equal((await call('/api/blocked',{env:{...prod,LOCAL_DEV:'true'},origin:apiOrigin})).status,503);
assert.equal((await call('/api/blocked',{env:prod,origin:'https://bypass.workers.dev'})).status,403);
assert.equal((await call('/api/admin/me',{env:prod,token:local.ADMIN_TOKEN,headers:{'Cf-Access-Authenticated-User-Email':'owner@example.test'}})).status,401);
assert.equal((await call('/admin',{env:prod})).status,401);
assert.equal((await call('/api/admin/me',{env:{...prod,ACCESS_AUD:''}})).status,503);
assert.equal((await call('/api/blocked',{env:{...prod,INGRESS_LIMITER:undefined}})).status,503);
let dbReads = 0;
const forbiddenDB = {prepare(){dbReads++;throw new Error('Database should not be reached');}};
const denied = await report(fakeToken,sample,{env:{...prod,DB:forbiddenDB,AUTH_LIMITER:{async limit(){return {success:false};}}}});
assert.equal(denied.status,429); assert.equal(denied.headers.get('Retry-After'),'60'); assert.equal(dbReads,0);
assert.equal((await register('',{env:{...prod,DB:forbiddenDB,REGISTRATION_LIMITER:{async limit(){return {success:false};}}}})).status,429);
assert.equal(dbReads,0);
assert.equal((await call('/api/blocked',{env:{...prod,DB:forbiddenDB,DB_LIMITER:{async limit(){return {success:false};}}}})).status,429);
assert.equal(dbReads,0);
assert.equal((await call('/api/blocked',{env:{...prod,INGRESS_LIMITER:{async limit(){throw new Error('unavailable');}}}})).status,503);
limitCalls.length=0;
await call('/api/health',{env:prod,headers:{'CF-Connecting-IP':'192.0.2.1','X-Forwarded-For':'1.1.1.1'}});
await call('/api/health',{env:prod,headers:{'CF-Connecting-IP':'192.0.2.1','X-Forwarded-For':'8.8.8.8'}});
assert.equal(limitCalls[0].key,limitCalls[1].key); assert.match(limitCalls[0].key,/^[a-f0-9]{64}$/);
assert.equal((await report(issued.token,sample,{env:prod,headers:{Origin:'https://evil.example'}})).status,403);
assert.equal((await register('',{env:prod,headers:{Origin:'https://evil.example'}})).status,403);
const cors = await report(issued.token,sample,{env:prod,headers:{Origin:'chrome-extension://'+'a'.repeat(32)}});
assert.equal(cors.status,201); assert.equal(cors.headers.get('Access-Control-Allow-Origin'),'chrome-extension://'+'a'.repeat(32));
assert.equal((await report(issued.token,sample,{env:{...prod,REPORTER_LIMITER:{async limit(){return {success:false};}}}})).status,429);

// Real RSA signatures, real jose verifier and the production remote-JWKS path.
const {privateKey,publicKey} = await generateKeyPair('RS256');
const jwk = {...await exportJWK(publicKey),kid:'test-key',use:'sig',alg:'RS256'};
const originalFetch = globalThis.fetch;
let keyFetches=0;
globalThis.fetch = async url => {
  assert.equal(String(url),prod.ACCESS_TEAM_DOMAIN+'/cdn-cgi/access/certs'); keyFetches++;
  return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json'}});
};
const now=Math.floor(Date.now()/1000);
async function jwt(overrides={},header={alg:'RS256',kid:'test-key'},key=privateKey) {
  return new SignJWT({iss:prod.ACCESS_TEAM_DOMAIN,aud:prod.ACCESS_AUD,sub:'admin-subject',email:'owner@example.test',iat:now,exp:now+3600,...overrides}).setProtectedHeader(header).sign(key);
}
try {
  const valid=await jwt();
  const accessCall=(path,token=valid,options={})=>call(path,{env:prod,...options,headers:{'Cf-Access-Jwt-Assertion':token,...options.headers}});
  assert.equal((await accessCall('/api/admin/me')).data.actor,'access:admin-subject');
  for(const claims of [{aud:'another-app'},{iss:'https://evil.example'},{exp:now-60},{iat:now+600},{iat:now-9*3600},{exp:undefined},{sub:undefined}]) {
    assert.equal((await accessCall('/api/admin/me',await jwt(claims))).status,401);
  }
  assert.equal((await accessCall('/api/admin/me',await jwt({email:'outsider@example.test'}))).status,403);
  const wrongKey=await generateKeyPair('RS256');
  assert.equal((await accessCall('/api/admin/me',await jwt({},undefined,wrongKey.privateKey))).status,401);
  const hs=await jwt({},{alg:'HS256'},new TextEncoder().encode('x'.repeat(32)));
  assert.equal((await accessCall('/api/admin/me',hs)).status,401);
  assert.equal((await accessCall('/api/admin/me','eyJhbGciOiJub25lIn0.eyJlbWFpbCI6Im93bmVyQGV4YW1wbGUudGVzdCJ9.')).status,401);
  assert.equal(keyFetches,1,'Repeated verification uses cached JWKS');
  const page=await accessCall('/admin');
  assert.equal(page.status,200);
  const csp=page.headers.get('Content-Security-Policy');
  assert.equal(csp.includes('unsafe-inline'),false);
  const nonce=csp.match(/script-src 'nonce-([^']+)'/)[1];
  assert.ok(page.text.includes('<script nonce="'+nonce+'">'));
  assert.ok(page.text.includes('<style nonce="'+nonce+'">'));
  assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(page.headers.get('Cache-Control'),'no-store');
  assert.equal(page.headers.get('Access-Control-Allow-Origin'),null);
  assert.ok(page.headers.get('Strict-Transport-Security'));
  const decidedViaAccess=await accessCall('/api/admin/channels/%40securitytest',valid,{method:'POST',body:{status:'approved',note:'Access owner action'}});
  assert.equal(decidedViaAccess.status,200);
  assert.equal(DB.sqlite.prepare("SELECT actor FROM security_audit WHERE target = '@securitytest' ORDER BY id DESC").get().actor,'access:admin-subject');
} finally {globalThis.fetch=originalFetch;}

// Paging is bounded; revisions prevent publishing a mixture of two blocklist versions.
const insert=DB.sqlite.prepare("INSERT INTO moderation_channels (channel_handle,channel_name,channel_url,reason,status,moderation_note) VALUES (?, 'Demo', 'https://www.youtube.com/@demo', 'test', 'approved', 'Reviewed')");
for(let i=0;i<501;i++) insert.run('@page'+String(i).padStart(4,'0'));
const first=await call('/api/blocked');
assert.equal(first.data.data.length,500); assert.ok(first.data.next_cursor);
const second=await call('/api/blocked?cursor='+encodeURIComponent(first.data.next_cursor)+'&revision='+first.data.revision);
assert.equal(second.data.data.length,2); assert.equal(second.data.next_cursor,null);
assert.equal((await call('/api/blocked?cursor=%40page0001')).status,400);
assert.equal((await call('/api/blocked?revision=-1')).status,400);
assert.equal((await call('/api/blocked?limit=999999')).status,400);
await admin('channels/%40page0000',{status:'rejected',note:'Synthetic removal'});
assert.equal((await call('/api/blocked?cursor='+encodeURIComponent(first.data.next_cursor)+'&revision='+first.data.revision)).status,409);

// Cached public responses skip D1, but never skip ingress limits or cache an admin response.
let writes=0; const stored=new Map(); const background=[];
globalThis.caches={default:{async match(req){return stored.get(req.url)?.clone();},async put(req,res){writes++;stored.set(req.url,res);}}};
try {
  const request=new Request(apiOrigin+'/api/blocked');
  const res=await worker.fetch(request,prod,{waitUntil(p){background.push(p);}});
  assert.equal(res.status,200); await Promise.all(background);
  assert.equal(writes,1);
  const cached=await worker.fetch(request,{...prod,DB:forbiddenDB});
  assert.equal(cached.status,200); assert.equal(dbReads,0);
  assert.equal((await worker.fetch(request,{...prod,INGRESS_LIMITER:{async limit(){return {success:false};}}})).status,429);
} finally {delete globalThis.caches;}

const oldError=console.error; const logs=[]; console.error=value=>logs.push(value);
try {
  const result=await call('/api/blocked',{env:{...local,DB:{batch(){throw new Error('super-secret-database-details');}}}});
  assert.equal(result.status,500);
  assert.equal(result.text.includes('super-secret'),false);
  assert.equal(logs.join('').includes('super-secret'),false);
  assert.ok(result.data.request_id);
} finally {console.error=oldError;}
DB.sqlite.close();
console.log('PASS security: production JWT/host/CSRF gates, rate limits before DB, body bounds/timeouts, anonymous renewal/revocation, audit, paging revisions/cache and safe errors');
