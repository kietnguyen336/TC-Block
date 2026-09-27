export const adminPage = `<!doctype html>
<html lang="vi" data-local="__LOCAL__"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TC-Block | Duyệt cộng đồng</title>
<style>
body{font:16px system-ui;margin:32px auto;padding:0 20px;max-width:980px;color:#222;background:#fffafa}
section,article{background:white;border:1px solid #efdadd;border-radius:12px;padding:20px;margin:16px 0}
input,select,button,textarea{font:inherit;padding:10px;border:1px solid #bbb;border-radius:6px;margin:4px;max-width:90%}
button{cursor:pointer;background:#fff0f2}button:disabled{opacity:.5}textarea{width:90%}small{color:#666}
#message{white-space:pre-wrap;overflow-wrap:anywhere}pre{white-space:pre-wrap}h2{font-size:20px}
html[data-local="false"] .local-only{display:none}
</style>
<h1>Duyệt kênh cộng đồng</h1><p>5 người hợp lệ trong 30 ngày: ưu tiên duyệt. Chỉ kênh được duyệt mới được chặn chung.</p>
<section><label class="local-only">Khóa quản trị local <input id="key" type="password" autocomplete="off"></label>
<button id="connect">Kết nối</button><button id="logout">Xóa thông tin trên trang</button><small id="authHelp">Public: đăng nhập qua Cloudflare Access. Khóa local không có hiệu lực trên public host.</small></section>
<p id="message" role="status"></p>
<section><h2>Người tham gia</h2><p>Mỗi người chỉ cấp một mã. Xác minh người tham gia trước khi cấp; mã không tự chứng minh danh tính.</p>
<input id="label" placeholder="Tên người tham gia" maxlength="120"><button id="issue">Cấp mã</button>
<pre id="issued"></pre><div id="reporters"></div><button id="moreReporters" hidden>Trang người tham gia tiếp</button></section>
<section><h2>Danh sách duyệt</h2><select id="status"><option value="pending">Chờ duyệt</option><option value="approved">Đã duyệt</option><option value="rejected">Đã từ chối / gỡ</option></select>
<button id="refresh">Tải lại</button><p>100 kênh mỗi trang, ưu tiên số người báo cáo hợp lệ cao nhất.</p><div id="channels"></div><button id="moreChannels" hidden>Trang kênh tiếp</button></section>
<script>
const $ = id => document.getElementById(id);
let key = '';
let reporterCursor = null;
let channelOffset = null;
async function api(path, body) {
  const res = await fetch('/api/admin/' + path, {method: body ? 'POST' : 'GET', credentials:'same-origin', redirect:'error', headers: {...(key ? {'Authorization':'Bearer ' + key} : {}), 'Content-Type':'application/json', 'X-TC-Admin-Action':'1'}, ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Không thể thực hiện'); return data;
}
function action(fn) { return async () => { try { $('message').textContent = ''; await fn(); } catch(e) { $('message').textContent = e.message; } }; }
function el(tag, text) { const node = document.createElement(tag); node.textContent = text; return node; }
async function reporters(cursor = '') {
  const result = await api('reporters' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '')); $('reporters').replaceChildren();
  reporterCursor = result.next_cursor; $('moreReporters').hidden = !reporterCursor;
  result.data.forEach(r => { const row = el('p', r.label + (r.active ? ' — Đang hoạt động ' : ' — Đã thu hồi'));
    if(r.active) {
      row.append(el('small', r.expires_at ? ' · Hết hạn: ' + new Date(r.expires_at * 1000).toLocaleDateString('vi-VN') : ' · Mã cũ cần đổi'));
      const rotate = el('button','Đổi mã'); rotate.onclick = action(async () => {const data = await api('reporters/' + r.id + '/rotate', {}); $('issued').textContent = 'Mã mới (mã cũ đã vô hiệu): ' + data.token; await reporters();}); row.append(rotate);
      const button = el('button','Thu hồi mã'); button.onclick = action(async () => {await api('reporters/' + r.id + '/revoke', {}); await reporters(); await channels();}); row.append(button);
    }
    $('reporters').append(row);
  });
}
async function channels(offset = 0) {
  const result = await api('channels?status=' + $('status').value + '&offset=' + offset); $('channels').replaceChildren();
  channelOffset = result.next_offset; $('moreChannels').hidden = channelOffset === null || channelOffset === undefined;
  if (!result.data.length) $('channels').append(el('p','Không có kênh trong mục này.'));
  result.data.forEach(c => { const card = el('article',''); card.append(el('h3',c.channel_name + ' (' + c.channel_handle + ')'));
    card.append(el('p',c.recent_reports + ' người trong 30 ngày' + (c.priority ? ' — Ưu tiên duyệt' : '')));
    const link = el('a','Xem kênh YouTube'); link.href = c.channel_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; card.append(link);
    card.append(el('p','Lý do đầu tiên: ' + c.reason)); if(c.moderation_note) card.append(el('p','Quyết định trước: ' + c.moderation_note));
    const evidence = el('div',''); const inspect = el('button','Xem báo cáo'); inspect.onclick = action(async () => {
      const reports = await api('reports/' + encodeURIComponent(c.channel_handle)); evidence.replaceChildren();
      reports.data.forEach(r => evidence.append(el('p',r.label + ' · ' + r.created_at + (r.eligible ? ' · Hợp lệ' : ' · Không tính ưu tiên') + ': ' + r.reason)));
    }); card.append(inspect,evidence);
    const note = document.createElement('textarea'); note.placeholder = 'Lý do duyệt hoặc từ chối (bắt buộc)'; note.maxLength = 2000; card.append(note);
    [['approved','Duyệt chặn cộng đồng'],['rejected','Từ chối / gỡ chặn chung']].forEach(([status,label]) => {
      const button = el('button',label); button.onclick = action(async () => { if(!note.value.trim()) throw new Error('Hãy nhập lý do quyết định'); button.disabled = true;
        try {await api('channels/' + encodeURIComponent(c.channel_handle), {status,note:note.value}); await channels();} finally {button.disabled = false;} }); card.append(button);
    }); $('channels').append(card);
  });
}
$('connect').onclick = action(async () => {key = $('key').value.trim(); $('key').value = ''; await reporters(); await channels();});
$('logout').onclick = () => {key = ''; $('key').value = ''; ['reporters','channels','issued','message'].forEach(id => $(id).replaceChildren());};
$('issue').onclick = action(async () => {const data = await api('reporters',{label:$('label').value}); $('issued').textContent = 'Lưu mã này và đưa cho đúng người (chỉ hiển thị một lần):\\n' + data.token; $('label').value = ''; await reporters();});
$('refresh').onclick = action(channels); $('status').onchange = action(channels);
$('moreReporters').onclick = action(() => reporters(reporterCursor));
$('moreChannels').onclick = action(() => channels(channelOffset));
</script></html>`;

export function renderAdminPage(nonce, local) {
  return adminPage.replace('__LOCAL__', String(local))
    .replace('<style>', `<style nonce="${nonce}">`).replace('<script>', `<script nonce="${nonce}">`);
}
