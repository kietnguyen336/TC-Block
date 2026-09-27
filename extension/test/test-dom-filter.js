import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Exercise the production content script with a minimal DOM fixture.
const messages = [];
let receive;
let map = {};
const timers = [];
class Classes {
  constructor() { this.values = new Set(); }
  add(...items) { items.forEach(i => this.values.add(i)); }
  remove(...items) { items.forEach(i => this.values.delete(i)); }
  contains(item) { return this.values.has(item); }
}
function card(handle) {
  const attrs = {};
  const node = {
    handle, classList: new Classes(), style: {}, button: null,
    getAttribute(key) { return attrs[key] || null; },
    setAttribute(key, value) { attrs[key] = value; },
    removeAttribute(key) { delete attrs[key]; },
    querySelector(selector) {
      if (selector === '.tc-card-report-btn') return this.button;
      if (selector === '#thumbnail') return this;
      if (selector.includes('href') || selector.includes('channel-name')) return {
        textContent: this.handle, href: 'https://www.youtube.com/' + this.handle,
        getAttribute: () => '/' + this.handle,
      };
      return null;
    },
    appendChild(button) { this.button = button; button.remove = () => {this.button = null;}; },
  };
  return node;
}
const cards = [card('@spam'), card('@good')];
const document = {
  readyState: 'complete', body: {}, title: 'YouTube',
  querySelectorAll() { return cards; },
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() {return {setAttribute(){},addEventListener(){}};},
};
const context = vm.createContext({
  document, URL, CSS: {escape: value => value}, console,
  window: {location:{origin:'https://www.youtube.com',pathname:'/'},getComputedStyle:()=>({position:'relative'}),requestAnimationFrame:fn=>fn(),addEventListener(){}},
  chrome: {runtime: {
    id: 'tc-block-test',
    sendMessage(message, callback) { messages.push(message); if(callback) callback({channels:map}); return Promise.resolve(); },
    onMessage: {addListener(fn){receive = fn;}},
  }},
  MutationObserver: class {observe(){}},
  setTimeout(fn) {timers.push(fn);},
});
const source = readFileSync(new URL('../content/content.js', import.meta.url),'utf8');
vm.runInContext(source, context);
function drain() {while(timers.length) timers.shift()();}
drain();
assert.ok(cards[0].button);
assert.equal(cards[0].classList.contains('tc-channel-blocked'),false);
receive({action:'BLOCKLIST_UPDATED',channels:{'@spam':{}}}); drain();
assert.equal(cards[0].classList.contains('tc-channel-blocked'),true,'Previously scanned card must hide after sync');
assert.equal(cards[1].classList.contains('tc-channel-blocked'),false);
receive({action:'BLOCKLIST_UPDATED',channels:{'@spam':{}}}); drain();
assert.equal(messages.some(m=>m.action==='INCREMENT_HIDDEN_COUNT'),false,'Filtering channels does not track individual hidden videos');
receive({action:'BLOCKLIST_UPDATED',channels:{}}); drain();
assert.equal(cards[0].classList.contains('tc-channel-blocked'),false,'Personal exception or server removal restores card');
const oldButton = cards[0].button;
cards[0].handle = '@different';
receive({action:'BLOCKLIST_UPDATED',channels:{'@different':{}}}); drain();
assert.equal(cards[0].getAttribute('data-tc-handle'),'@different');
assert.equal(cards[0].button,null,'Recycled card must discard old report target');
assert.equal(cards[0].classList.contains('tc-channel-blocked'),true);
cards[0].handle = '@tiếngviệt';
receive({action:'BLOCKLIST_UPDATED',channels:{'@tiếngviệt':{}}}); drain();
assert.equal(cards[0].classList.contains('tc-channel-blocked'),true);
cards[0].handle = 'channel/UCabcdefghijklmnopqrstuv';
receive({action:'BLOCKLIST_UPDATED',channels:{UCabcdefghijklmnopqrstuv:{}}}); drain();
assert.equal(cards[0].getAttribute('data-tc-handle'),'UCabcdefghijklmnopqrstuv');
assert.equal(cards[0].classList.contains('tc-channel-blocked'),true);
console.log('PASS production content script: sync hides scanned cards, unblock restores, no double count, recycled cards, Unicode and channel IDs');
