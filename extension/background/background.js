// Production builds are pinned to one backend. The endpoint is not user-editable.
const DEFAULT_API_URL = 'https://tc-block-api.kietnguyen336.workers.dev';
const SYNC_ALARM_NAME = 'tc_block_sync_alarm';
const REPORTER_REFRESH_WINDOW_SECONDS = 7 * 86400;
let serial = Promise.resolve();
function enqueue(task) {
  const result = serial.then(task);
  serial = result.catch(() => {});
  return result;
}
function normalizeChannel(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim().normalize('NFC');
  if (/^UC[A-Za-z0-9_-]{22}$/.test(clean)) return clean;
  const handle = clean.startsWith('@') ? clean : '@' + clean;
  return /^@[\p{L}\p{M}\p{N}_.-]{1,100}$/u.test(handle) ? handle.toLowerCase() : '';
}
function emptyScope() { return { personal: {}, allowed: {}, community: {}, pending: {}, token: '', tokenExpiresAt: 0, lastSync: null, syncError: '' }; }
async function loadState() {
  const saved = await chrome.storage.local.get(['tc_state_v2']);
  const previous = saved.tc_state_v2;
  if (!previous?.scopes || typeof previous.scopes !== 'object') {
    return { apiUrl: DEFAULT_API_URL, scopes: { [DEFAULT_API_URL]: emptyScope() } };
  }
  if (previous.apiUrl === DEFAULT_API_URL && previous.scopes[DEFAULT_API_URL]) return previous;
  // Preserve local choices from older configurable builds, but never copy their
  // credential, remote cache or queued reports into the official backend.
  const legacy = previous.scopes[previous.apiUrl] || emptyScope();
  const current = previous.scopes[DEFAULT_API_URL] || emptyScope();
  current.personal = { ...(legacy.personal || {}), ...(current.personal || {}) };
  current.allowed = { ...(legacy.allowed || {}), ...(current.allowed || {}) };
  const migrated = { apiUrl: DEFAULT_API_URL, scopes: { [DEFAULT_API_URL]: current } };
  await save(migrated);
  return migrated;
}
function scopeOf(state) { return state.scopes[state.apiUrl] ||= emptyScope(); }
function effective(scope) {
  const map = {};
  for (const [key, value] of Object.entries(scope.community)) map[key] = { ...value, source: 'community' };
  for (const [key, value] of Object.entries(scope.personal)) map[key] = { ...value, source: 'personal', report_status: scope.pending[key]?.status || 'sent' };
  for (const key of Object.keys(scope.allowed)) delete map[key];
  return map;
}
async function save(state) { await chrome.storage.local.set({ tc_state_v2: state }); }
async function broadcast(state) {
  const channels = effective(scopeOf(state));
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
  await Promise.all(tabs.filter(t => t.id).map(tab => chrome.tabs.sendMessage(tab.id, { action: 'BLOCKLIST_UPDATED', channels }).catch(() => {})));
}
async function publish(state) { await save(state); await broadcast(state); }
async function api(state, path, body) {
  const scope = scopeOf(state);
  const response = await fetch(state.apiUrl + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(body && scope.token ? { Authorization: 'Bearer ' + scope.token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) throw new Error('Phản hồi API vượt giới hạn');
      chunks.push(value);
    }
  } finally { reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!response.ok || !data.success) throw Object.assign(new Error(data.error || `HTTP ${response.status}`), {
    status: response.status, retryAfter: Math.min(86400, Math.max(60, Number(response.headers.get('Retry-After')) || 60)),
  });
  return data;
}
async function ensureReporter(state, force = false) {
  const scope = scopeOf(state);
  const now = Math.floor(Date.now() / 1000);
  if (!force && scope.token && Number(scope.tokenExpiresAt) > now + REPORTER_REFRESH_WINDOW_SECONDS) return;
  const data = await api(state, '/api/register', {});
  if (!/^tcr_[A-Za-z0-9_-]{43}$/.test(data.token) || !Number.isSafeInteger(data.expires_at) || data.expires_at <= now) {
    throw new Error('Máy chủ trả về danh tính báo cáo không hợp lệ');
  }
  scope.token = data.token;
  scope.tokenExpiresAt = data.expires_at;
  await save(state);
}
async function provisionReporter(state, force = false) {
  const scope = scopeOf(state);
  try { await ensureReporter(state, force); }
  catch (error) {
    if (!scope.token || (error.status !== 401 && error.status !== 403)) throw error;
    scope.token = ''; scope.tokenExpiresAt = 0;
    await save(state);
    await ensureReporter(state, true);
  }
}
async function flushReports(state, onlyHandle) {
  const scope = scopeOf(state);
  const pending = Object.entries(scope.pending).filter(([handle, entry]) =>
    (!onlyHandle || handle === onlyHandle) && entry.status !== 'failed');
  if (!pending.length) return;
  if (scope.reportRetryAt > Date.now()) return;
  try { await provisionReporter(state); }
  catch (err) {
    if (err.status === 429) scope.reportRetryAt = Date.now() + err.retryAfter * 1000;
    for (const entry of Object.values(scope.pending)) entry.error = 'Không thể khởi tạo danh tính ẩn danh: ' + err.message;
    await save(state); return;
  }
  let attempts = 0;
  for (const [handle, entry] of pending) {
    if (++attempts > 5) break;
    try { await api(state, '/api/reports', entry.payload); delete scope.pending[handle]; }
    catch (err) {
      if (err.status === 401) {
        try { await provisionReporter(state, true); await api(state, '/api/reports', entry.payload); delete scope.pending[handle]; continue; }
        catch (refreshError) { err = refreshError; }
      }
      entry.error = err.message;
      if (err.status === 429) scope.reportRetryAt = Date.now() + err.retryAfter * 1000;
      if (err.status === 400 || err.status === 413) entry.status = 'failed';
      else break;
    }
  }
  await save(state);
}
async function sync(state) {
  const scope = scopeOf(state);
  await flushReports(state);
  try {
    const community = {};
    let cursor = null; let revision;
    const seen = new Set();
    for (let page = 0; page < 100; page++) {
      const path = cursor ? `/api/blocked?cursor=${encodeURIComponent(cursor)}&revision=${revision}` : '/api/blocked';
      const data = await api(state, path);
      if (!Array.isArray(data.data) || data.data.length > 500 || !Number.isSafeInteger(data.revision) || data.revision < 0) throw new Error('Danh sách cộng đồng không hợp lệ');
      if (revision !== undefined && revision !== data.revision) throw new Error('Danh sách đã đổi; vui lòng đồng bộ lại');
      revision = data.revision;
      for (const item of data.data) {
        const handle = normalizeChannel(item.channel_handle);
        if (!handle || typeof item.channel_name !== 'string' || item.channel_name.length > 200 || typeof item.reason !== 'string' || item.reason.length > 2000) throw new Error('Thông tin kênh không hợp lệ');
        community[handle] = { channel_handle: handle, channel_name: item.channel_name, reason: item.reason };
      }
      cursor = data.next_cursor;
      if (cursor === null) break;
      if (typeof cursor !== 'string' || normalizeChannel(cursor) !== cursor || seen.has(cursor) || page === 99) throw new Error('Phân trang API không hợp lệ');
      seen.add(cursor);
    }
    scope.community = community;
    scope.lastSync = new Date().toISOString(); scope.syncError = '';
    await publish(state);
    return { success: true, channels: effective(scope), pendingCount: Object.keys(scope.pending).length };
  } catch (err) {
    scope.syncError = err.message; await save(state);
    return { success: false, error: err.message };
  }
}
async function handleMessage(message, sender) {
  if (!message || typeof message.action !== 'string') throw new Error('Thông điệp không hợp lệ');
  const trustedPage = sender.url === chrome.runtime.getURL('popup/popup.html') ||
    sender.url === chrome.runtime.getURL('details/details.html');
  let youtube = false;
  try { const url = new URL(sender.url); youtube = url.protocol === 'https:' && (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')); } catch {}
  if (!trustedPage && (!youtube || !['GET_BLOCKED_CHANNELS', 'SUBMIT_REPORT'].includes(message.action))) throw new Error('Nguồn thông điệp không được phép');
  const state = await loadState();
  const scope = scopeOf(state);
  switch (message.action) {
    case 'GET_SUMMARY':
      return { success: true, blockedCount: Object.keys(effective(scope)).length };
    case 'GET_BLOCKED_CHANNELS': {
      return { success: true, channels: effective(scope), apiUrl: state.apiUrl, lastSyncTime: scope.lastSync,
        syncError: scope.syncError, pendingCount: Object.keys(scope.pending).length,
        pendingError: Object.values(scope.pending).find(p => p.error)?.error || '', allowed: scope.allowed };
    }
    case 'SUBMIT_REPORT': {
      const input = message.data || {};
      const handle = normalizeChannel(input.channel_handle);
      if (!handle || typeof input.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 2000) throw new Error('Kênh hoặc lý do không hợp lệ');
      const payload = { channel_handle: handle, channel_name: String(input.channel_name || handle).slice(0, 200), reason: input.reason.trim() };
      if (!scope.personal[handle] && Object.keys(scope.personal).length >= 5000) throw new Error('Đã đạt giới hạn 5000 kênh chặn riêng');
      scope.personal[handle] = payload; delete scope.allowed[handle];
      scope.pending[handle] = { payload, status: 'queued', error: '' };
      await publish(state); // Hide immediately, before network access.
      await flushReports(state, handle);
      return { success: true, queued: !!scope.pending[handle], error: scope.pending[handle]?.error, data: payload };
    }
    case 'UNBLOCK_CHANNEL': {
      const handle = normalizeChannel(message.handle);
      if (!handle) throw new Error('Kênh không hợp lệ');
      scope.allowed[handle] = scope.personal[handle] || scope.community[handle] || { channel_handle: handle, channel_name: handle };
      delete scope.personal[handle]; delete scope.pending[handle];
      await publish(state);
      return { success: true }; // Never calls the community moderation API.
    }
    case 'REMOVE_EXCEPTION': {
      const handle = normalizeChannel(message.handle);
      if (!handle) throw new Error('Kênh không hợp lệ');
      delete scope.allowed[handle]; await publish(state); return { success: true };
    }
    case 'FORCE_SYNC': return sync(state);
    default: throw new Error('Thao tác không hợp lệ');
  }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  enqueue(() => handleMessage(message, sender)).then(sendResponse, error => sendResponse({ success: false, error: error.message }));
  return true;
});
function initialize() {
  chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  chrome.alarms.create(SYNC_ALARM_NAME, { periodInMinutes: 10 });
  enqueue(async () => sync(await loadState())).catch(console.error);
}
chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === SYNC_ALARM_NAME) enqueue(async () => sync(await loadState())).catch(console.error);
});
