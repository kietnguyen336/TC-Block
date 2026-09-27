import assert from 'node:assert/strict';
import { backgroundHarness } from './background-harness.js';

const item = handle => ({channel_handle:handle,channel_name:handle,reason:'Reviewed'});
let phase='baseline'; let requests=0;
const client=backgroundHarness(async url => {
  requests++;
  if(phase==='oversized') return new Response(JSON.stringify({success:true,data:[],revision:1,next_cursor:null,padding:'x'.repeat(4*1024*1024)}));
  if(phase==='baseline') return new Response(JSON.stringify({success:true,data:[item('@baseline')],revision:1,next_cursor:null}));
  const second=new URL(url).searchParams.has('cursor');
  const data={success:true,data:[item(second?'@b':'@a')],revision:phase==='mixed'&&second?2:1,next_cursor:second?null:'@a'};
  if(phase==='loop') data.next_cursor='@a';
  if(phase==='many') data.data=Array.from({length:501},()=>item('@a'));
  return new Response(JSON.stringify(data));
});
await client.send({action:'FORCE_SYNC'});
for(const invalid of ['mixed','loop','many','oversized']) {
  phase=invalid;
  assert.equal((await client.send({action:'FORCE_SYNC'})).success,false,invalid);
  const current=await client.send({action:'GET_BLOCKED_CHANNELS'});
  assert.ok(current.channels['@baseline'],'Bad or partial responses must not replace saved list');
}
phase='valid';
assert.equal((await client.send({action:'FORCE_SYNC'})).success,true);
let current=await client.send({action:'GET_BLOCKED_CHANNELS'});
assert.deepEqual(Object.keys(current.channels).sort(),['@a','@b']);
const before=requests;
for(const url of ['https://evil.example','https://youtube.com.evil.example','http://www.youtube.com']) {
  assert.equal((await client.send({action:'FORCE_SYNC'},url)).success,false);
  assert.equal((await client.send({action:'SUBMIT_REPORT',data:{channel_handle:'@x',reason:'x'}},url)).success,false);
}
assert.equal((await client.send({action:'FORCE_SYNC'},'https://www.youtube.com/watch')).success,false,'Content scripts cannot force API traffic');
assert.equal(requests,before);
assert.equal((await client.send(null)).success,false);

let posts=0;
const throttled=backgroundHarness(async (url,options)=>{
  if(url.endsWith('/api/register')) return new Response(JSON.stringify({success:true,token:'tcr_'+'B'.repeat(43),expires_at:Math.floor(Date.now()/1000)+365*86400}),{status:201});
  if(url.endsWith('/api/reports')) {posts++;return new Response(JSON.stringify({success:false,error:'Rate limited'}),{status:429,headers:{'Retry-After':'120'}});}
  return new Response(JSON.stringify({success:true,data:[],revision:1,next_cursor:null}));
});
await throttled.send({action:'SET_SETTINGS',url:'http://localhost:8787'});
assert.equal((await throttled.send({action:'SUBMIT_REPORT',data:{channel_handle:'@limited',reason:'spam'}})).queued,true);
await throttled.send({action:'FORCE_SYNC'});
await throttled.send({action:'SUBMIT_REPORT',data:{channel_handle:'@another',reason:'spam'}});
assert.equal(posts,1,'Repeated user actions respect Retry-After');
current=await throttled.send({action:'GET_BLOCKED_CHANNELS'});
assert.equal(current.pendingCount,2);
assert.ok(current.channels['@limited']); assert.ok(current.channels['@another']);
console.log('PASS extension security: paginated atomic sync, malformed/oversized responses, sender restrictions and rate-limit backoff');
