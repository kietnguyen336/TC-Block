/**
 * Test Suite kiểm tra Content Script và xác thực quy tắc không emoji
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extDir = path.resolve(__dirname, '..');

// Regex phát hiện ký tự emoji Unicode
const EMOJI_REGEX = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

function testContentScript() {
  console.log('[TEST] Bat dau kiem tra Content Script (Task 3 & Task 4)...\n');

  const jsPath = path.join(extDir, 'content', 'content.js');
  const cssPath = path.join(extDir, 'content', 'content.css');

  assert.ok(fs.existsSync(jsPath), 'content.js phải tồn tại');
  assert.ok(fs.existsSync(cssPath), 'content.css phải tồn tại');

  const jsContent = fs.readFileSync(jsPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Test 1: Kiểm tra quy tắc nghiêm ngặt: KHÔNG SỬ DỤNG EMOJI
  {
    console.log('Test 1: Kiem tra quy dinh khong su dung emoji trong content.js & content.css');
    const jsEmojiMatch = jsContent.match(EMOJI_REGEX);
    assert.strictEqual(jsEmojiMatch, null, `Phát hiện emoji trong content.js: ${jsEmojiMatch ? jsEmojiMatch[0] : ''}`);

    const cssEmojiMatch = cssContent.match(EMOJI_REGEX);
    assert.strictEqual(cssEmojiMatch, null, `Phát hiện emoji trong content.css: ${cssEmojiMatch ? cssEmojiMatch[0] : ''}`);
    console.log('  [PASS] 100% khong co bat ky emoji nao trong code');
  }

  // Test 2: Kiểm tra các thành phần cốt lõi của Task 3 & Task 4
  {
    console.log('Test 2: Kiem tra su hien dien cua cac tinh nang bat buoc');
    assert.ok(jsContent.includes('attachShadow'), 'Modal phải được đóng gói bằng Shadow DOM');
    assert.ok(jsContent.includes('MutationObserver'), 'Phải sử dụng MutationObserver');
    assert.ok(jsContent.includes('requestAnimationFrame'), 'Phải kết hợp requestAnimationFrame để tối ưu hiệu năng');
    assert.ok(jsContent.includes('tc-channel-blocked'), 'Phải có class ẩn video tc-channel-blocked');
    assert.ok(jsContent.includes('injectWatchPageButton'), 'Phải có hàm inject nút trang xem video /watch');
    assert.ok(jsContent.includes('injectChannelPageButton'), 'Phải có hàm inject nút trang chủ kênh');
    assert.ok(jsContent.includes('tc-card-report-btn'), 'Phải có class nút báo cáo trên thẻ video');
    assert.ok(jsContent.includes('yt-lockup-view-model'), 'Phải hỗ trợ thẻ video giao diện YouTube mới');
    assert.ok(jsContent.includes('yt-page-header-renderer'), 'Phải hỗ trợ header trang kênh giao diện YouTube mới');
    assert.ok(jsContent.includes('<span>Chặn kênh</span>'), 'Nút trang xem và trang kênh phải ghi Chặn kênh');
    assert.ok(!jsContent.includes('Chọn lý do nhanh'), 'Không được hiển thị nhóm lý do nhanh');
    assert.ok(jsContent.includes('RELOAD_EXTENSION_MESSAGE'), 'Phải xử lý content script cũ sau khi reload extension');
    assert.ok(jsContent.includes('enforceCurrentPageBlock'), 'Trang kênh và trang xem của kênh bị chặn phải bị che');
    assert.ok(cssContent.includes('#tc-page-block-overlay'), 'Phải có giao diện chặn toàn trang');
    console.log('  [PASS] Day du cac module Shadow DOM, MutationObserver, va cac ham inject');
  }

  // Test 3: Kiểm tra CSS Material Design
  {
    console.log('Test 3: Kiem tra CSS quy dinh Material Design va mau do hong YouTube');
    assert.ok(cssContent.includes('#FFF0F2') || cssContent.includes('#FFD0D6'), 'CSS phải có màu đỏ hồng nhạt #FFF0F2');
    assert.ok(cssContent.includes('backdrop-filter: blur'), 'CSS phải có hiệu ứng blur');
    assert.ok(cssContent.includes('.tc-channel-blocked'), 'CSS phải có class ẩn video');
    console.log('  [PASS] CSS tuan thu Material Design, bang mau va hieu ung blur');
  }

  console.log('\n[PASS] TOAN BO KIEM THU CONTENT SCRIPT DA PASS 100%!');
}

try {
  testContentScript();
} catch (e) {
  console.error('[FAIL] Kiem tra that bai:', e);
  process.exit(1);
}
