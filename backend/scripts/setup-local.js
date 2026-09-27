import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

try {
  writeFileSync(new URL('../.dev.vars', import.meta.url),
    `LOCAL_DEV=true\nADMIN_TOKEN=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Created backend/.dev.vars with a random local-only key. Read it locally when signing in; do not publish it.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Existing .dev.vars preserved. No secrets changed.');
}
