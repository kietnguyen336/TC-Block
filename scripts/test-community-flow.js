import assert from 'node:assert/strict';
import worker from '../backend/src/index.js';
import { createD1 } from '../backend/test/d1.js';
import { backgroundHarness } from '../extension/test/background-harness.js';

// Integration: real background message handler -> real Worker -> real SQLite queries.
const env = { DB: createD1(), LOCAL_DEV: 'true', ADMIN_TOKEN: 'integration-admin-key-with-at-least-32-characters' };
const transport = (url, options) => worker.fetch(new Request(url, options), env);
async function admin(path, body) {
  const response = await transport('http://localhost:8787/api/admin/' + path, {
    method: body ? 'POST' : 'GET', headers: {Authorization:'Bearer ' + env.ADMIN_TOKEN,'Content-Type':'application/json',Origin:'http://localhost:8787','X-TC-Admin-Action':'1'},
    ...(body ? {body:JSON.stringify(body)} : {}),
  });
  assert.ok(response.ok); return response.json();
}
const people = [];
for(let i=0;i<5;i++) {
  const client = backgroundHarness(transport, {}, {apiUrl:'http://localhost:8787'});
  people.push(client);
}
const viewer = backgroundHarness(transport, {}, {apiUrl:'http://localhost:8787'});
const data = {channel_handle:'@spam',channel_name:'Spam',reason:'Repeated misleading uploads'};
for(const client of people) {
  assert.equal((await client.send({action:'SUBMIT_REPORT',data})).queued,false);
  assert.ok((await client.send({action:'GET_BLOCKED_CHANNELS'})).channels['@spam']);
}
await people[0].send({action:'SUBMIT_REPORT',data});
const queue = await admin('channels');
assert.equal(queue.data[0].recent_reports,5);
assert.equal(queue.data[0].priority,true);
await viewer.send({action:'FORCE_SYNC'});
assert.equal((await viewer.send({action:'GET_BLOCKED_CHANNELS'})).channels['@spam'],undefined);
await admin('channels/%40spam',{status:'approved',note:'Evidence reviewed'});
await viewer.send({action:'FORCE_SYNC'});
assert.equal((await viewer.send({action:'GET_BLOCKED_CHANNELS'})).channels['@spam'].source,'community');
await viewer.send({action:'UNBLOCK_CHANNEL',handle:'@spam'});
await viewer.send({action:'FORCE_SYNC'});
assert.equal((await viewer.send({action:'GET_BLOCKED_CHANNELS'})).channels['@spam'],undefined);
assert.equal((await admin('channels?status=approved')).data.length,1);
await admin('channels/%40spam',{status:'rejected',note:'Decision reversed'});
await people[0].send({action:'FORCE_SYNC'});
assert.equal((await people[0].send({action:'GET_BLOCKED_CHANNELS'})).channels['@spam'].source,'personal');
env.DB.sqlite.close();
console.log('PASS integration: 5 reporters -> priority -> admin approval -> community sync -> personal exception -> admin removal');
