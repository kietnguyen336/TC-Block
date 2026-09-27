import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function backgroundHarness(fetch, initial = {}) {
  const storage = structuredClone(initial);
  let listener;
  const broadcasts = [];
  const chrome = {
    runtime: {
      getURL: path => 'chrome-extension://test/' + path,
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener() {} }, onStartup: { addListener() {} },
    },
    storage: { local: {
      async get(keys) { return structuredClone(Object.fromEntries(keys.filter(k => k in storage).map(k => [k, storage[k]]))); },
      async set(value) { Object.assign(storage, structuredClone(value)); },
    } },
    tabs: { async query() { return [{ id: 1 }]; }, async sendMessage(id, data) { broadcasts.push(structuredClone(data)); } },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  };
  const context = vm.createContext({ chrome, fetch, URL, AbortSignal, TextDecoder, console });
  vm.runInContext(readFileSync(new URL('../background/background.js', import.meta.url), 'utf8'), context);
  return {
    storage, broadcasts,
    send(message, url = 'chrome-extension://test/popup/popup.html') {
      return new Promise(resolve => listener(message, { url }, resolve));
    },
  };
}
