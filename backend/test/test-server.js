import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker, { normalizeChannel } from '../src/index.js';
import { adminPage } from '../src/admin.js';
import { createD1 } from './d1.js';

const DB = createD1();
const env = { DB, LOCAL_DEV: 'true', ADMIN_TOKEN: 'test-only-admin-secret-at-least-32-characters' };
async function call(path, method = 'GET', body, token = '') {
  const response = await worker.fetch(new Request('http://localhost:8787' + path, {
    method, headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8787', 'X-TC-Admin-Action': '1', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), env);
  return { status: response.status, ...(await response.json()) };
}
const admin = (path, method = 'GET', body) => call('/api/admin/' + path, method, body, env.ADMIN_TOKEN);
const register = () => call('/api/register', 'POST', {});
const payload = { channel_handle: '@TestChannel', channel_name: 'Test Channel', reason: 'Spam videos' };
assert.equal((await call('/api/admin/channels')).status, 401);
assert.equal((await call('/api/reports', 'POST', payload)).status, 401);
assert.equal((await call('/api/blocked/@testchannel', 'DELETE')).status, 404);
const people = [];
for (let i = 0; i < 6; i++) people.push(await register());
const report = (i, data = payload) => call('/api/reports', 'POST', data, people[i].token);
assert.equal((await report(0)).status, 201);
for (let i = 0; i < 5; i++) assert.equal((await report(0)).duplicate, true);
assert.equal((await admin('channels')).data[0].recent_reports, 1);
assert.equal((await call('/api/blocked')).count, 0);
for (let i = 1; i < 5; i++) await report(i);
let queue = (await admin('channels')).data[0];
assert.equal(queue.recent_reports, 5);
assert.equal(queue.priority, true);
assert.equal(queue.status, 'pending');
assert.equal((await call('/api/blocked')).count, 0, 'Five votes never auto-approve');
DB.sqlite.prepare("UPDATE community_reports SET created_at = datetime('now', '-31 days') WHERE reporter_id = ?").run(people[0].reporter_id);
await report(0);
assert.equal((await admin('channels')).data[0].recent_reports, 4, 'Retry cannot refresh expired vote');
assert.equal((await admin('channels')).data[0].priority, false);
assert.equal((await report(5)).data.recent_reports, 5);
const evidence = await admin('reports/%40testchannel');
assert.equal(evidence.data.length, 6);
assert.equal(evidence.data.filter(r => r.eligible).length, 5);
assert.equal((await call('/api/admin/channels/%40testchannel', 'POST', {status:'approved',note:'Reviewed'}, people[0].token)).status, 401);
assert.equal((await admin('channels/%40testchannel', 'POST', {status:'approved',note:''})).status, 400);
assert.equal((await admin('channels/%40testchannel', 'POST', {status:'approved',note:'Reviewed spam evidence'})).success, true);
let blocked = await call('/api/blocked');
assert.equal(blocked.count, 1);
assert.equal(blocked.data[0].reason, 'Reviewed spam evidence');
await admin('channels/%40testchannel', 'POST', {status:'rejected',note:'Decision corrected'});
assert.equal((await call('/api/blocked')).count, 0);
await report(1);
assert.equal((await admin('channels?status=rejected')).data[0].status, 'rejected');
assert.equal(DB.sqlite.prepare('SELECT COUNT(*) AS n FROM moderation_events').get().n, 2);
await admin('reporters/' + people[1].reporter_id + '/revoke', 'POST', {});
assert.equal((await report(1)).status, 401);
assert.equal((await admin('channels?status=rejected')).data[0].recent_reports, 4);
for (const bad of [null, [], { ...payload, reason: 1 }, { ...payload, channel_handle: {} }, { ...payload, reason: 'x'.repeat(2001) }]) {
  assert.equal((await report(2, bad)).status, 400);
}
assert.equal(normalizeChannel('UCabcdefghijklmnopqrstuv'), 'UCabcdefghijklmnopqrstuv');
assert.equal(normalizeChannel('@TiếngViệt'), '@tiếngviệt');
for (let i = 0; i < 19; i++) assert.equal((await report(2, {...payload,channel_handle:'@spam' + i})).status, 201);
assert.equal((await report(2, {...payload,channel_handle:'@overlimit'})).status, 429);
assert.equal((await report(2)).duplicate, true, 'Duplicate retry works even at quota');
const concurrentPerson = await register();
const burst = await Promise.all(Array.from({length:25}, (_, i) => call('/api/reports', 'POST', {
  ...payload, channel_handle:'@burst' + i,
}, concurrentPerson.token)));
assert.equal(burst.filter(r => r.status === 201).length, 20, 'Quota must hold for overlapping requests');
assert.equal(burst.filter(r => r.status === 429).length, 5);
assert.equal(DB.sqlite.prepare("SELECT COUNT(*) AS n FROM moderation_channels WHERE channel_handle LIKE '@burst%'").get().n, 20, 'Rejected requests must not create empty review entries');
assert.equal((await worker.fetch(new Request('https://test/api/blocked'), {})).status, 503);
assert.equal((await worker.fetch(new Request('https://test/api/admin/channels'), {DB})).status, 503);
assert.equal(DB.sqlite.prepare('SELECT token_hash FROM reporters WHERE id = ?').get(people[0].reporter_id).token_hash.length, 64);
assert.equal(DB.sqlite.prepare('SELECT token_hash FROM reporters WHERE id = ?').get(people[0].reporter_id).token_hash === people[0].token, false);
const summary = await admin('summary');
assert.equal(summary.data.pending >= 1, true);
assert.equal(summary.data.active_reporters, 6);
// Parse the actual inline admin script, including escapes in the HTML template.
new vm.Script(adminPage.match(/<script>([\s\S]*?)<\/script>/)[1]);
DB.sqlite.close();
console.log('PASS backend: authorization, distinct votes, rolling window, approval/rejection, revocation, validation, quota, SQL and admin script');
