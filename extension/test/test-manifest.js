/**
 * Test Suite kiểm tra tính hợp lệ của manifest.json và các file cấu hình Extension
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(__dirname, '..');

function testManifest() {
  console.log('[TEST] Bat dau kiem tra Manifest V3 va tai nguyen extension...\n');

  // 1. Đọc và parse manifest.json
  const manifestPath = path.join(extDir, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json phải tồn tại');
  const manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestRaw);

  // 2. Kiểm tra các trường bắt buộc Manifest V3
  assert.strictEqual(manifest.manifest_version, 3, 'manifest_version phải là 3');
  assert.ok(manifest.name, 'Extension phải có tên');
  assert.ok(manifest.version, 'Extension phải có phiên bản');
  assert.ok(manifest.permissions.includes('storage'), 'Cần quyền storage');
  assert.ok(manifest.permissions.includes('alarms'), 'Cần quyền alarms');
  console.log('  [PASS] Cau truc manifest.json hop le chuan MV3');

  // 3. Kiểm tra file icons
  ['16', '48', '128'].forEach(size => {
    const iconRel = manifest.icons[size];
    assert.ok(iconRel, `manifest.icons phải có kích thước ${size}`);
    const iconPath = path.join(extDir, iconRel);
    assert.ok(fs.existsSync(iconPath), `File icon ${iconRel} phải tồn tại`);
    const stat = fs.statSync(iconPath);
    assert.ok(stat.size > 0, `File icon ${iconRel} không được rỗng`);
  });
  console.log('  [PASS] Toan bo 3 kich thuoc icon PNG (16, 48, 128) deu ton tai va hop le');

  // 4. Kiểm tra background service worker
  const swRel = manifest.background?.service_worker;
  assert.ok(swRel, 'Phải khai báo background.service_worker');
  const swPath = path.join(extDir, swRel);
  assert.ok(fs.existsSync(swPath), `File Service Worker ${swRel} phải tồn tại`);
  console.log('  [PASS] File Service Worker background.js ton tai');

  // 5. Kiểm tra host_permissions
  assert.ok(manifest.host_permissions.some(h => h.includes('youtube.com')), 'Phải có quyền truy cập youtube.com');
  assert.ok(manifest.host_permissions.includes('https://tc-block-api.kietnguyen336.workers.dev/*'), 'Phải ghim đúng API production');
  assert.ok(!manifest.host_permissions.some(h => h.includes('*.workers.dev') || h.includes('localhost') || h.includes('127.0.0.1')), 'Bản production không cấp quyền cho API tùy ý hoặc localhost');
  console.log('  [PASS] Host permissions bao gom YouTube va Cloudflare API');

  console.log('\n[PASS] TOAN BO KIEM TRA MANIFEST V3 DA PASS 100%!');
}

try {
  testManifest();
} catch (e) {
  console.error('[FAIL] Kiem tra manifest that bai:', e);
  process.exit(1);
}
