import { renderAdminPage } from './admin.js';
import { HttpError, fail, digest, bearer, bodyOf, localMode, checkTransport, ingress,
  rateLimit, reportOrigin, checkAdminMutation, authenticateAdmin, randomToken, TOKEN_PATTERN, securityHeaders } from './security.js';

const PAGE_SIZE = 500;
const TOKEN_LIFETIME_SECONDS = 365 * 86400;
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers,
  } });
}
export function normalizeChannel(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim().normalize('NFC');
  if (/^UC[A-Za-z0-9_-]{22}$/.test(clean)) return clean;
  const handle = clean.startsWith('@') ? clean : '@' + clean;
  return /^@[\p{L}\p{M}\p{N}_.-]{1,100}$/u.test(handle) ? handle.toLowerCase() : '';
}
function channelFromPath(value) {
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { fail('Kênh không hợp lệ'); }
  const handle = normalizeChannel(decoded);
  if (!handle) fail('Kênh không hợp lệ');
  return handle;
}
function field(value, name, max) {
  if (typeof value !== 'string' || value.trim().length > max || !value.trim() || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) fail(`${name} không hợp lệ`);
  return value.trim();
}
function queryKeys(url, allowed) {
  const seen = new Set();
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || seen.has(key)) fail('Tham số không hợp lệ');
    seen.add(key);
  }
}
function audit(db, actor, action, target) {
  return db.prepare('INSERT INTO security_audit (actor, action, target) VALUES (?, ?, ?)').bind(actor, action, target);
}
const recentCount = `(SELECT COUNT(*) FROM community_reports r JOIN reporters p ON p.id = r.reporter_id
  WHERE r.channel_handle = c.channel_handle AND p.active = 1
  AND r.created_at >= datetime('now', '-30 days'))`;

async function adminApi(request, env, url, actor) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;
  await rateLimit(request, env, 'ADMIN_LIMITER', actor);
  await rateLimit(request, env, 'DB_LIMITER', 'database');
  if (path === '/api/admin/me' && method === 'GET') return json({ success: true, actor });
  if (path === '/api/admin/summary' && method === 'GET') {
    queryKeys(url, []);
    const rows = await db.batch([
      db.prepare("SELECT COUNT(*) AS value FROM moderation_channels WHERE status = 'pending'"),
      db.prepare(`SELECT COUNT(*) AS value FROM moderation_channels c WHERE c.status = 'pending' AND ${recentCount} >= 5`),
      db.prepare("SELECT COUNT(*) AS value FROM moderation_channels WHERE status = 'approved'"),
      db.prepare("SELECT COUNT(*) AS value FROM moderation_channels WHERE status = 'rejected'"),
      db.prepare("SELECT COUNT(*) AS value FROM community_reports WHERE created_at >= datetime('now', '-30 days')"),
      db.prepare('SELECT COUNT(*) AS value FROM reporters WHERE active = 1'),
    ]);
    const values = rows.map(row => Number(row.results[0]?.value || 0));
    return json({ success: true, data: {
      pending: values[0], priority: values[1], approved: values[2], rejected: values[3],
      reports_30d: values[4], active_reporters: values[5],
    } });
  }
  const credential = path.match(/^\/api\/admin\/reporters\/([a-f0-9-]{36})\/revoke$/);
  if (credential && method === 'POST') {
    queryKeys(url, []);
    await bodyOf(request);
    const [, id] = credential;
    const reporter = await db.prepare('SELECT active FROM reporters WHERE id = ?').bind(id).first();
    if (!reporter) fail('Không tìm thấy nguồn báo cáo', 404);
    if (!reporter.active) return json({ success: true, duplicate: true });
    await db.batch([db.prepare('UPDATE reporters SET active = 0 WHERE id = ?').bind(id), audit(db, actor, 'reporter.revoke', id)]);
    return json({ success: true });
  }
  if (path === '/api/admin/channels' && method === 'GET') {
    queryKeys(url, ['status', 'offset', 'q']);
    const status = url.searchParams.get('status') || 'pending';
    const offset = url.searchParams.get('offset') || '0';
    const search = (url.searchParams.get('q') || '').trim().normalize('NFC');
    if (!['pending', 'approved', 'rejected'].includes(status) || !/^\d{1,5}$/.test(offset) || search.length > 100 || /[\u0000-\u001F\u007F]/.test(search)) fail('Tham số không hợp lệ');
    const pattern = '%' + search.replace(/[\\%_]/g, '\\$&') + '%';
    const { results } = await db.prepare(`SELECT c.*, ${recentCount} AS recent_reports
      FROM moderation_channels c WHERE c.status = ? AND (? = '' OR c.channel_handle LIKE ? ESCAPE '\\' OR c.channel_name LIKE ? ESCAPE '\\')
      ORDER BY recent_reports DESC, c.updated_at DESC, c.channel_handle LIMIT 101 OFFSET ?`).bind(status, search, pattern, pattern, Number(offset)).all();
    return json({ success: true, data: results.slice(0, 100).map(c => ({ ...c, priority: c.status === 'pending' && c.recent_reports >= 5 })),
      next_offset: results.length > 100 ? Number(offset) + 100 : null });
  }
  const evidence = path.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (evidence && method === 'GET') {
    queryKeys(url, []);
    const handle = channelFromPath(evidence[1]);
    const { results } = await db.prepare(`SELECT r.reporter_id, r.reason, r.created_at, p.label, p.active,
      r.created_at >= datetime('now', '-30 days') AND p.active = 1 AS eligible
      FROM community_reports r JOIN reporters p ON p.id = r.reporter_id
      WHERE r.channel_handle = ? ORDER BY r.created_at DESC LIMIT 200`).bind(handle).all();
    return json({ success: true, data: results });
  }
  const decision = path.match(/^\/api\/admin\/channels\/([^/]+)$/);
  if (decision && method === 'POST') {
    queryKeys(url, []);
    const handle = channelFromPath(decision[1]);
    const body = await bodyOf(request);
    if (!['approved', 'rejected'].includes(body.status)) fail('Quyết định không hợp lệ');
    const rawNote = body.note ?? '';
    if (typeof rawNote !== 'string' || rawNote.trim().length > 2000 || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(rawNote)) fail('Ghi chú duyệt không hợp lệ');
    const note = rawNote.trim();
    if (!await db.prepare('SELECT channel_handle FROM moderation_channels WHERE channel_handle = ?').bind(handle).first()) fail('Không tìm thấy kênh', 404);
    await db.batch([
      db.prepare(`UPDATE moderation_channels SET status = ?, moderation_note = ?, reviewed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP WHERE channel_handle = ?`).bind(body.status, note, handle),
      db.prepare('INSERT INTO moderation_events (channel_handle, status, note) VALUES (?, ?, ?)').bind(handle, body.status, note),
      audit(db, actor, 'channel.' + body.status, handle),
      db.prepare('UPDATE public_state SET revision = revision + 1 WHERE id = 1'),
    ]);
    return json({ success: true });
  }
  fail('API không tồn tại', 404);
}

async function registerReporter(request, env, url) {
  queryKeys(url, []);
  await bodyOf(request);
  const supplied = bearer(request);
  if (supplied && !TOKEN_PATTERN.test(supplied)) fail('Danh tính báo cáo không hợp lệ', 401);
  await rateLimit(request, env, 'REGISTRATION_LIMITER', await digest(request.headers.get('CF-Connecting-IP') || 'unknown'));
  await rateLimit(request, env, 'DB_LIMITER', 'database');
  const expires = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
  if (supplied) {
    const reporter = await env.DB.prepare('SELECT id, active FROM reporters WHERE token_hash = ?').bind(await digest(supplied)).first();
    if (!reporter || !reporter.active) fail('Danh tính báo cáo đã bị thu hồi hoặc không tồn tại', 403);
    await env.DB.prepare(`INSERT INTO reporter_credentials (reporter_id, expires_at) VALUES (?, ?)
      ON CONFLICT(reporter_id) DO UPDATE SET expires_at = excluded.expires_at`).bind(reporter.id, expires).run();
    return json({ success: true, reporter_id: reporter.id, token: supplied, expires_at: expires });
  }
  const id = crypto.randomUUID();
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO reporters (id, label, token_hash) VALUES (?, ?, ?)').bind(id, 'Ẩn danh ' + id.slice(0, 8), await digest(token)),
    env.DB.prepare('INSERT INTO reporter_credentials (reporter_id, expires_at) VALUES (?, ?)').bind(id, expires),
  ]);
  return json({ success: true, reporter_id: id, token, expires_at: expires }, 201);
}

async function submitReport(request, env, url) {
  queryKeys(url, []);
  const token = bearer(request);
  if (!TOKEN_PATTERN.test(token)) fail('Mã báo cáo không hợp lệ', 401);
  // Reject malformed/oversized streams before spending a database operation.
  const body = await bodyOf(request);
  const handle = normalizeChannel(body.channel_handle);
  if (!handle) fail('Kênh không hợp lệ');
  const name = field(body.channel_name ?? handle, 'Tên kênh', 200);
  const reason = field(body.reason, 'Lý do', 2000);
  await rateLimit(request, env, 'DB_LIMITER', 'database');
  const db = env.DB;
  const reporter = await db.prepare(`SELECT p.id FROM reporters p JOIN reporter_credentials c ON c.reporter_id = p.id
    WHERE p.token_hash = ? AND p.active = 1 AND c.expires_at > ?`).bind(await digest(token), Math.floor(Date.now() / 1000)).first();
  if (!reporter) fail('Mã báo cáo không hợp lệ, hết hạn hoặc đã bị thu hồi', 401);
  await rateLimit(request, env, 'REPORTER_LIMITER', reporter.id);
  const existing = await db.prepare('SELECT created_at FROM community_reports WHERE channel_handle = ? AND reporter_id = ?').bind(handle, reporter.id).first();
  if (existing) return json({ success: true, duplicate: true, message: 'Báo cáo đã được ghi nhận; không tăng phiếu' });
  const channelUrl = `https://www.youtube.com/${handle.startsWith('@') ? encodeURIComponent(handle).replace('%40', '@') : 'channel/' + handle}`;
  // Enforced inside the same transaction as insertion, including revocation/rotation/expiry races.
  const eligible = `EXISTS (SELECT 1 FROM reporters p JOIN reporter_credentials c ON c.reporter_id = p.id
    WHERE p.id = ? AND p.token_hash = ? AND p.active = 1 AND c.expires_at > unixepoch())
    AND (SELECT COUNT(*) FROM community_reports WHERE reporter_id = ? AND created_at >= datetime('now', '-1 day')) < 20`;
  const hash = await digest(token);
  const writes = await db.batch([
    db.prepare(`INSERT INTO moderation_channels (channel_handle, channel_name, channel_url, reason)
      SELECT ?, ?, ?, ? WHERE ${eligible} ON CONFLICT(channel_handle) DO NOTHING`).bind(handle, name, channelUrl, reason, reporter.id, hash, reporter.id),
    db.prepare(`INSERT INTO community_reports (channel_handle, reporter_id, reason)
      SELECT ?, ?, ? WHERE ${eligible} ON CONFLICT(channel_handle, reporter_id) DO NOTHING`).bind(handle, reporter.id, reason, reporter.id, hash, reporter.id),
  ]);
  if (!writes[1].meta.changes) {
    if (await db.prepare('SELECT created_at FROM community_reports WHERE channel_handle = ? AND reporter_id = ?').bind(handle, reporter.id).first()) {
      return json({ success: true, duplicate: true });
    }
    fail('Đã đạt giới hạn báo cáo hoặc mã không còn hiệu lực', 429, 86400);
  }
  const channel = await db.prepare(`SELECT c.status, ${recentCount} AS recent_reports FROM moderation_channels c WHERE c.channel_handle = ?`).bind(handle).first();
  return json({ success: true, message: 'Đã nhận báo cáo; chỉ chặn cộng đồng sau khi được duyệt',
    data: { channel_handle: handle, ...channel, priority: channel.status === 'pending' && channel.recent_reports >= 5 } }, 201);
}

async function publicList(request, env, url, ctx) {
  queryKeys(url, ['cursor', 'revision']);
  const cursor = url.searchParams.get('cursor') || '';
  const revision = url.searchParams.get('revision');
  if (cursor && normalizeChannel(cursor) !== cursor) fail('Cursor không hợp lệ');
  if (cursor && revision === null || revision !== null && !/^(0|[1-9]\d{0,14})$/.test(revision)) fail('Revision không hợp lệ');
  // Cache only canonical public data, never credentials, CORS decisions or admin responses.
  const canonical = new URL('/api/blocked', url.origin);
  if (cursor) canonical.searchParams.set('cursor', cursor);
  if (revision !== null) canonical.searchParams.set('revision', revision);
  const key = new Request(canonical.toString());
  const cache = !localMode(request, env) ? globalThis.caches?.default : null;
  if (cache) {
    try { const hit = await cache.match(key); if (hit) return hit; } catch { /* DB budget still applies. */ }
  }
  await rateLimit(request, env, 'DB_LIMITER', 'database');
  const [state, page] = await env.DB.batch([
    env.DB.prepare('SELECT revision FROM public_state WHERE id = 1'),
    env.DB.prepare(`SELECT channel_handle, channel_name, channel_url,
      COALESCE(NULLIF(moderation_note, ''), reason) AS reason, updated_at
      FROM moderation_channels WHERE status = 'approved' AND channel_handle > ? ORDER BY channel_handle LIMIT ?`).bind(cursor, PAGE_SIZE + 1),
  ]);
  const current = state.results[0].revision;
  if (revision !== null && Number(revision) !== current) fail('Danh sách đã đổi; hãy đồng bộ lại từ đầu', 409);
  const rows = page.results.slice(0, PAGE_SIZE);
  const response = json({ success: true, count: rows.length, data: rows, revision: current,
    next_cursor: page.results.length > PAGE_SIZE ? rows.at(-1).channel_handle : null }, 200, { 'Cache-Control': 'public, max-age=60' });
  if (cache && ctx?.waitUntil) ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
  return response;
}

export default {
  async fetch(request, env = {}, ctx) {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const path = url.pathname;
    const admin = path === '/admin' || path.startsWith('/api/admin/');
    let cors = {};
    let response;
    try {
      if (request.url.length > 2048) fail('URL quá dài', 414);
      checkTransport(request, env, admin);
      if (!['GET', 'POST', 'OPTIONS'].includes(request.method)) fail('API không tồn tại', 404);
      if (!admin && !['/', '/api/health', '/api/blocked', '/api/register', '/api/reports'].includes(path)) fail('API không tồn tại', 404);
      await ingress(request, env, admin || path === '/api/register' || path === '/api/reports');
      if (path === '/api/register' || path === '/api/reports') {
        const origin = reportOrigin(request, env);
        if (origin) cors = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
      } else if (!admin) cors = { 'Access-Control-Allow-Origin': '*' };
      if (request.method === 'OPTIONS') {
        if (admin) fail('Không hỗ trợ truy cập quản trị khác origin', 403);
        const expected = path === '/api/register' || path === '/api/reports' ? 'POST' : 'GET';
        if (request.headers.get('Access-Control-Request-Method') !== expected) fail('Preflight không hợp lệ', 405);
        response = new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Methods': expected, 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '600', 'Cache-Control': 'no-store',
        } });
      } else if (admin) {
        checkAdminMutation(request);
        const actor = await authenticateAdmin(request, env, path === '/admin');
        if (path === '/admin' && request.method === 'GET') {
          queryKeys(url, []);
          const nonce = crypto.randomUUID().replaceAll('-', '');
          response = new Response(renderAdminPage(nonce, localMode(request, env)), { headers: {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
          } });
        } else {
          if (!env.DB) fail('Dịch vụ chưa sẵn sàng', 503);
          response = await adminApi(request, env, url, actor);
        }
      } else if (request.method === 'GET' && ['/', '/api/health'].includes(path)) {
        queryKeys(url, []);
        response = json({ success: !!env.DB, status: env.DB ? 'ok' : 'unavailable' }, env.DB ? 200 : 503);
      } else {
        if (!env.DB) fail('Dịch vụ chưa sẵn sàng', 503);
        if (path === '/api/register' && request.method === 'POST') response = await registerReporter(request, env, url);
        else if (path === '/api/reports' && request.method === 'POST') response = await submitReport(request, env, url);
        else if (path === '/api/blocked' && request.method === 'GET') response = await publicList(request, env, url, ctx);
        else fail('API không tồn tại', 404);
      }
    } catch (err) {
      const known = err instanceof HttpError;
      if (!known) console.error(JSON.stringify({ event: 'internal_error', request_id: requestId, area: admin ? 'admin' : 'public' }));
      response = json({ success: false, error: known ? err.message : 'Lỗi máy chủ nội bộ', request_id: requestId }, known ? err.status : 500,
        known && err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {});
    }
    const headers = new Headers({ ...securityHeaders(request), ...cors });
    for (const [key, value] of response.headers) headers.set(key, value);
    headers.set('X-Request-Id', requestId);
    return new Response(response.body, { status: response.status, headers });
  },
};
