import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function backgroundHarness(fetch, initial = {}, options = {}) {
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
  let source = readFileSync(new URL('../background/background.js', import.meta.url), 'utf8');
  if (options.apiUrl) source = source.replace(
    "const DEFAULT_API_URL = 'https://tc-block-api.kietnguyen336.workers.dev';",
    'const DEFAULT_API_URL = ' + JSON.stringify(options.apiUrl) + ';',
  );
  vm.runInContext(source, context);
  return {
    storage, broadcasts,
    send(message, url = 'chrome-extension://test/popup/popup.html') {
      return new Promise(resolve => listener(message, { url }, resolve));
    },
  };
}
