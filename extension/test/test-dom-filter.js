/**
 * Test Suite kiểm thử logic lọc DOM và trích xuất thông tin kênh YouTube
 */

import assert from 'node:assert';

// Mô phỏng logic trích xuất handle và kiểm tra chặn trong content script
function extractChannelHandleFromHref(href) {
  if (!href) return null;
  try {
    const url = new URL(href, 'https://www.youtube.com');
    const pathname = url.pathname;

    // Trường hợp 1: URL dạng /@username (chuẩn YouTube hiện đại)
    const handleMatch = pathname.match(/\/(@[A-Za-z0-9_.-]+)/);
    if (handleMatch) {
      return handleMatch[1].toLowerCase();
    }

    // Trường hợp 2: URL dạng /channel/UC...
    const channelMatch = pathname.match(/\/channel\/([A-Za-z0-9_-]+)/);
    if (channelMatch) {
      return channelMatch[1].toLowerCase();
    }

    // Trường hợp 3: URL dạng /c/CustomName hoặc /user/UserName
    const customMatch = pathname.match(/\/(?:c|user)\/([A-Za-z0-9_.-]+)/);
    if (customMatch) {
      return '@' + customMatch[1].toLowerCase();
    }
  } catch (e) {
    // URL không hợp lệ
  }
  return null;
}

// Kiểm tra xem một video item có thuộc kênh bị chặn không
function shouldHideItem(itemLinks, blockedMap) {
  for (const href of itemLinks) {
    const handle = extractChannelHandleFromHref(href);
    if (handle && blockedMap[handle]) {
      return { shouldHide: true, matchedHandle: handle, info: blockedMap[handle] };
    }
  }
  return { shouldHide: false };
}

function runDomFilterTests() {
  console.log('🧪 Bắt đầu kiểm thử trích xuất và lọc video YouTube...\n');

  const blockedMap = {
    '@toxicchannel': { channel_name: 'Toxic Channel', reason: 'Tin giả' },
    '@spamreup': { channel_name: 'Spam Reup', reason: 'Bản quyền' },
    'uc1234567890abcdef': { channel_name: 'Channel ID Test', reason: 'Lừa đảo' },
  };

  // Test 1: Trích xuất các kiểu URL YouTube khác nhau
  {
    console.log('Test 1: Trích xuất channel handle từ các biến thể link YouTube');
    assert.strictEqual(extractChannelHandleFromHref('/@ToxicChannel'), '@toxicchannel');
    assert.strictEqual(extractChannelHandleFromHref('https://www.youtube.com/@ToxicChannel/videos'), '@toxicchannel');
    assert.strictEqual(extractChannelHandleFromHref('/@SpamReup?si=12345'), '@spamreup');
    assert.strictEqual(extractChannelHandleFromHref('/channel/UC1234567890abcdef'), 'uc1234567890abcdef');
    assert.strictEqual(extractChannelHandleFromHref('/c/KenhTuChe'), '@kenhtuche');
    assert.strictEqual(extractChannelHandleFromHref('/watch?v=dQw4w9WgXcQ'), null);
    console.log('  ✅ Pass: Trích xuất và chuẩn hóa handle chuẩn xác 100%');
  }

  // Test 2: Thẻ video chứa kênh bị chặn
  {
    console.log('Test 2: Kiểm tra quyết định ẩn video bị chặn');
    const badVideoLinks = ['/watch?v=abc', '/@ToxicChannel', '/@ToxicChannel'];
    const res = shouldHideItem(badVideoLinks, blockedMap);
    assert.strictEqual(res.shouldHide, true);
    assert.strictEqual(res.matchedHandle, '@toxicchannel');
    assert.strictEqual(res.info.reason, 'Tin giả');
    console.log('  ✅ Pass: Nhận diện chính xác video của kênh bị chặn');
  }

  // Test 3: Thẻ video của kênh bình thường không bị ẩn
  {
    console.log('Test 3: Thẻ video của kênh trong sạch');
    const goodVideoLinks = ['/watch?v=xyz', '/@GoodChannel'];
    const res = shouldHideItem(goodVideoLinks, blockedMap);
    assert.strictEqual(res.shouldHide, false);
    console.log('  ✅ Pass: Bỏ qua video kênh không bị chặn');
  }

  // Test 4: Trích xuất với URL chữ hoa/thường lẫn lộn
  {
    console.log('Test 4: Case-insensitivity');
    const mixedLinks = ['/@tOxIcChAnNeL'];
    const res = shouldHideItem(mixedLinks, blockedMap);
    assert.strictEqual(res.shouldHide, true);
    console.log('  ✅ Pass: Xử lý không phân biệt hoa thường');
  }

  console.log('\n🎉 TOÀN BỘ KIỂM THỬ LỌC DOM ĐÃ PASS 100%!');
}

runDomFilterTests();
