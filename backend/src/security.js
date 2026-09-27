import { createRemoteJWKSet, jwtVerify } from 'jose';

const encoder = new TextEncoder();
const jwksByIssuer = new Map();
export const MAX_BODY_BYTES = 16 * 1024;
export const BODY_TIMEOUT_MS = 5000;
export const TOKEN_PATTERN = /^tcr_[A-Za-z0-9_-]{43}$/;

export class HttpError extends Error {
  constructor(message, status = 400, retryAfter) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function fail(message, status = 400, retryAfter) {
  throw new HttpError(message, status, retryAfter);
}
export function localMode(request, env) {
  const url = new URL(request.url);
  return env.LOCAL_DEV === 'true' && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
function configuredOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {}
  fail('Dịch vụ chưa được cấu hình bảo mật', 503);
}
export function checkTransport(request, env, admin) {
  if (localMode(request, env)) return;
  // A dev flag accidentally deployed to a public hostname must never enable bypasses.
  if (env.LOCAL_DEV === 'true') fail('Không cho phép cấu hình local trên public host', 503);
  const expected = configuredOrigin(admin ? env.ADMIN_ORIGIN : env.API_ORIGIN);
  if (new URL(request.url).origin !== expected) fail('Host không được phép', 403);
}
export function bearer(request) {
  const header = request.headers.get('Authorization') || '';
  if (header.length > 512) fail('Thông tin xác thực không hợp lệ', 401);
  return header.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1] || '';
}
export async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return 'tcr_' + btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function rateLimit(request, env, binding, key) {
  if (localMode(request, env)) return;
  const limiter = env[binding];
  if (!limiter?.limit) fail('Dịch vụ bảo vệ tạm thời không khả dụng', 503);
  let result;
  try { result = await limiter.limit({ key }); } catch { fail('Dịch vụ bảo vệ tạm thời không khả dụng', 503); }
  if (result?.success !== true) fail('Quá nhiều yêu cầu. Vui lòng thử lại sau.', 429, 60);
}
export async function ingress(request, env, sensitive) {
  // Only the edge-supplied IP is used, never X-Forwarded-For. Stored keys are hashes.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await digest(ip);
  await rateLimit(request, env, 'INGRESS_LIMITER', key);
  if (sensitive) await rateLimit(request, env, 'AUTH_LIMITER', key);
}
export function reportOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return ''; // CLI/extension requests still need a valid reporter credential.
  const allowed = (env.EXTENSION_IDS || '').split(',').map(id => id.trim()).filter(id => /^[a-p]{32}$/.test(id));
  if (allowed.some(id => origin === 'chrome-extension://' + id)) return origin;
  if (localMode(request, env) && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return origin;
  if (localMode(request, env) && origin === new URL(request.url).origin) return origin;
  fail('Origin không được phép', 403);
}
export function checkAdminMutation(request) {
  if (request.method !== 'POST') return;
  const site = request.headers.get('Sec-Fetch-Site');
  if (request.headers.get('Origin') !== new URL(request.url).origin ||
      request.headers.get('X-TC-Admin-Action') !== '1' || (site && site !== 'same-origin')) {
    fail('Yêu cầu quản trị phải cùng origin', 403);
  }
}
function accessConfig(env) {
  if (typeof env.ACCESS_TEAM_DOMAIN !== 'string' || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN) ||
      typeof env.ACCESS_AUD !== 'string' || !env.ACCESS_AUD || !env.ADMIN_EMAILS?.trim()) {
    fail('Quản trị chưa được cấu hình Cloudflare Access', 503);
  }
  return { issuer: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD };
}
export async function verifyAccessJwt(token, env, keyResolver) {
  const config = accessConfig(env);
  if (!token || token.length > 8192) fail('Không có quyền quản trị', 401);
  let resolver = keyResolver;
  if (!resolver) {
    if (!jwksByIssuer.has(config.issuer)) {
      // The issuer comes from deployment config, never from attacker-controlled JWT claims.
      if (jwksByIssuer.size >= 4) jwksByIssuer.clear();
      jwksByIssuer.set(config.issuer, createRemoteJWKSet(new URL(config.issuer + '/cdn-cgi/access/certs'), {
        timeoutDuration: 3000, cooldownDuration: 60000, cacheMaxAge: 600000,
      }));
    }
    resolver = jwksByIssuer.get(config.issuer);
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, resolver, { ...config, algorithms: ['RS256'],
      requiredClaims: ['exp', 'iat', 'sub', 'email'], maxTokenAge: '8h', clockTolerance: 5 }));
  } catch { fail('Không có quyền quản trị', 401); }
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : '';
  const allowed = env.ADMIN_EMAILS.split(',').map(s => s.trim().toLowerCase());
  if (!allowed.includes(email) || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 200) fail('Không có quyền quản trị', 403);
  return 'access:' + payload.sub;
}
export async function authenticateAdmin(request, env, page = false) {
  if (!localMode(request, env)) return verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), env);
  if (page) return 'local-admin';
  if (typeof env.ADMIN_TOKEN !== 'string' || env.ADMIN_TOKEN.length < 32 || env.ADMIN_TOKEN.startsWith('replace-')) fail('Cần khóa local ngẫu nhiên tối thiểu 32 ký tự', 503);
  const candidate = bearer(request);
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.ADMIN_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode(env.ADMIN_TOKEN));
  if (!candidate || !await crypto.subtle.verify('HMAC', key, expected, encoder.encode(candidate))) fail('Không có quyền quản trị', 401);
  return 'local-admin';
}
export async function bodyOf(request) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(request.headers.get('Content-Type') || '')) fail('Chỉ nhận application/json UTF-8', 415);
  if (request.headers.has('Content-Encoding') && request.headers.get('Content-Encoding') !== 'identity') fail('Không nhận body nén', 415);
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) fail('Dữ liệu quá dài', 413);
  if (!request.body) fail('Thiếu JSON');
  const reader = request.body.getReader();
  let timer;
  try {
    const read = async () => {
      const chunks = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) fail('Dữ liệu quá dài', 413);
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('JSON không hợp lệ'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Dữ liệu không hợp lệ');
      return body;
    };
    return await Promise.race([read(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError('Hết thời gian nhận dữ liệu', 408)), BODY_TIMEOUT_MS);
    })]);
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
  }
}
export function securityHeaders(request) {
  return {
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer', 'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    ...(new URL(request.url).protocol === 'https:' ? { 'Strict-Transport-Security': 'max-age=31536000' } : {}),
  };
}
