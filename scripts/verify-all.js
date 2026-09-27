import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = [
  'backend/test/test-server.js',
  'backend/test/test-security.js',
  'extension/test/test-manifest.js',
  'extension/test/test-dom-filter.js',
  'extension/test/test-content-script.js',
  'extension/test/test-popup.js',
  'extension/test/test-background.js',
  'extension/test/test-sync-security.js',
  'scripts/test-community-flow.js',
];
for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`PASS all ${tests.length} suites. SQLite and browser API fixtures; not a live YouTube/browser E2E test.`);
