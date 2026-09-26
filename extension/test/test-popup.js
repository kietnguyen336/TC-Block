/**
 * Test Suite kiểm tra giao diện Popup và kiểm tra tuân thủ quy tắc không emoji
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(__dirname, '..');

const EMOJI_REGEX = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

function testPopup() {
  console.log('[TEST] Bat dau kiem tra Popup UI (Task 5)...\n');

  const htmlPath = path.join(extDir, 'popup', 'popup.html');
  const cssPath = path.join(extDir, 'popup', 'popup.css');
  const jsPath = path.join(extDir, 'popup', 'popup.js');

  assert.ok(fs.existsSync(htmlPath), 'popup.html phải tồn tại');
  assert.ok(fs.existsSync(cssPath), 'popup.css phải tồn tại');
  assert.ok(fs.existsSync(jsPath), 'popup.js phải tồn tại');

  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const js = fs.readFileSync(jsPath, 'utf8');

  // Test 1: Kiểm tra quy định KHÔNG SỬ DỤNG EMOJI
  {
    console.log('Test 1: Kiem tra quy dinh 0% emoji trong popup.html, popup.css, popup.js');
    assert.strictEqual(html.match(EMOJI_REGEX), null, 'Phát hiện emoji trong popup.html');
    assert.strictEqual(css.match(EMOJI_REGEX), null, 'Phát hiện emoji trong popup.css');
    assert.strictEqual(js.match(EMOJI_REGEX), null, 'Phát hiện emoji trong popup.js');
    console.log('  [PASS] 100% khong co bat ky emoji nao trong toan bo ma nguon popup');
  }

  // Test 2: Kiểm tra các thành phần giao diện bắt buộc
  {
    console.log('Test 2: Kiem tra cac thanh phan Material Design va chuc nang');
    assert.ok(html.includes('id="blockedCount"'), 'Phải có id blockedCount');
    assert.ok(html.includes('id="hiddenCount"'), 'Phải có id hiddenCount');
    assert.ok(html.includes('id="searchInput"'), 'Phải có ô tìm kiếm searchInput');
    assert.ok(html.includes('id="syncBtn"'), 'Phải có nút đồng bộ syncBtn');
    assert.ok(html.includes('id="settingsToggleBtn"'), 'Phải có nút cấu hình server');
    assert.ok(html.includes('<svg'), 'Phải sử dụng icon SVG');
    console.log('  [PASS] Day du cac the thong ke, tim kiem, dong bo va cai dat');
  }

  // Test 3: Kiểm tra CSS Material Design Trắng & Đỏ hồng nhạt
  {
    console.log('Test 3: Kiem tra bang mau Material Design va hieu ung Blur');
    assert.ok(css.includes('#FFF0F2'), 'CSS phải có màu hồng nhạt #FFF0F2');
    assert.ok(css.includes('#CC0000'), 'CSS phải có màu đỏ chủ đạo #CC0000');
    assert.ok(css.includes('backdrop-filter') || css.includes('box-shadow'), 'CSS phải có hiệu ứng đổ bóng mượt');
    console.log('  [PASS] CSS tuan thu Material Design');
  }

  // Test 4: Kiểm tra xử lý gỡ chặn và tìm kiếm trong JS
  {
    console.log('Test 4: Kiem tra logic JS');
    assert.ok(js.includes('UNBLOCK_CHANNEL'), 'Phải xử lý gỡ chặn qua UNBLOCK_CHANNEL');
    assert.ok(js.includes('FORCE_SYNC'), 'Phải xử lý FORCE_SYNC');
    assert.ok(js.includes('currentSearchQuery'), 'Phải có logic tìm kiếm');
    console.log('  [PASS] Logic xu ly day du');
  }

  console.log('\n[PASS] TOAN BO KIEM THU POPUP DA PASS 100%!');
}

try {
  testPopup();
} catch (e) {
  console.error('[FAIL] Kiem tra popup that bai:', e);
  process.exit(1);
}
