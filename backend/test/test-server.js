/**
 * Test Suite cho TC-Block Backend Cloudflare Worker API
 */

import assert from 'node:assert';
import worker from '../src/index.js';

// Tạo Mock D1 Database in-memory để kiểm thử
function createMockD1() {
  const reports = [];
  const blockedChannels = new Map();

  return {
    prepare(query) {
      const exec = (...args) => ({
        async run() {
          const q = query.trim().toUpperCase();
          if (q.startsWith('INSERT INTO REPORTS')) {
            const [channel_handle, channel_name, reason, ip] = args;
            reports.push({ channel_handle, channel_name, reason, ip, created_at: new Date().toISOString() });
            return { success: true };
          }
          if (q.startsWith('INSERT INTO BLOCKED_CHANNELS')) {
            const [channel_handle, channel_name, channel_url, reason] = args;
            const existing = blockedChannels.get(channel_handle);
            if (existing) {
              existing.report_count += 1;
              existing.reason = reason;
              existing.channel_name = channel_name;
              existing.status = 'active';
              existing.updated_at = new Date().toISOString();
            } else {
              blockedChannels.set(channel_handle, {
                id: blockedChannels.size + 1,
                channel_handle,
                channel_name,
                channel_url,
                reason,
                report_count: 1,
                status: 'active',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            }
            return { success: true };
          }
          if (q.startsWith('UPDATE BLOCKED_CHANNELS')) {
            const [channel_handle] = args;
            const existing = blockedChannels.get(channel_handle);
            if (existing) {
              existing.status = 'inactive';
              existing.updated_at = new Date().toISOString();
            }
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          const q = query.trim().toUpperCase();
          if (q.includes('FROM BLOCKED_CHANNELS')) {
            const results = Array.from(blockedChannels.values())
              .filter(c => c.status === 'active')
              .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
            return { results };
          }
          return { results: [] };
        },
      });

      return {
        bind(...args) {
          return exec(...args);
        },
        run(...args) {
          return exec(...args).run();
        },
        all(...args) {
          return exec(...args).all();
        },
      };
    },
    _getReports: () => reports,
    _getBlocked: () => blockedChannels,
  };
}

async function runTests() {
  console.log('🧪 Bắt đầu kiểm thử TC-Block Backend Cloudflare Worker API...\n');

  const mockDb = createMockD1();
  const env = { DB: mockDb };

  // Test 1: OPTIONS CORS Preflight
  {
    console.log('Test 1: OPTIONS CORS Preflight');
    const req = new Request('http://localhost:8787/api/reports', { method: 'OPTIONS' });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
    console.log('  ✅ Pass: CORS Preflight trả về 204 và headers đầy đủ');
  }

  // Test 2: GET /api/health
  {
    console.log('Test 2: GET /api/health');
    const req = new Request('http://localhost:8787/api/health');
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
    console.log('  ✅ Pass: Health check thành công');
  }

  // Test 3: POST /api/reports - Validate lỗi thiếu trường
  {
    console.log('Test 3: POST /api/reports validation');
    const req = new Request('http://localhost:8787/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_handle: '', reason: '' }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
    console.log('  ✅ Pass: Báo lỗi 400 khi thiếu thông tin bắt buộc');
  }

  // Test 4: POST /api/reports - Báo cáo kênh mới hợp lệ
  {
    console.log('Test 4: POST /api/reports - Báo cáo kênh thành công');
    const req = new Request('http://localhost:8787/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_handle: 'ToxicChannel123',
        channel_name: 'Kênh Giật Gân',
        reason: 'Nội dung phản cảm, sai sự thật',
      }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.channel_handle, '@toxicchannel123'); // Đã chuẩn hóa chữ thường và thêm @
    console.log('  ✅ Pass: Ghi nhận báo cáo và chuẩn hóa handle chuẩn xác');
  }

  // Test 5: GET /api/blocked - Lấy danh sách kênh bị chặn
  {
    console.log('Test 5: GET /api/blocked');
    const req = new Request('http://localhost:8787/api/blocked');
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 1);
    assert.strictEqual(data.data[0].channel_handle, '@toxicchannel123');
    console.log('  ✅ Pass: Lấy danh sách chặn thành công (1 kênh)');
  }

  // Test 6: POST /api/reports - Báo cáo trùng kênh (Upsert tăng lượt)
  {
    console.log('Test 6: POST /api/reports trùng kênh (Tăng lượt report)');
    const req = new Request('http://localhost:8787/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel_handle: '@toxicchannel123',
        channel_name: 'Kênh Giật Gân Cập Nhật',
        reason: 'Lừa đảo tài chính',
      }),
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 201);

    // Kiểm tra danh sách lại
    const reqGet = new Request('http://localhost:8787/api/blocked');
    const resGet = await worker.fetch(reqGet, env);
    const dataGet = await resGet.json();
    assert.strictEqual(dataGet.count, 1);
    assert.strictEqual(dataGet.data[0].report_count, 2);
    assert.strictEqual(dataGet.data[0].reason, 'Lừa đảo tài chính');
    console.log('  ✅ Pass: Tăng số lượt report và cập nhật lý do mới nhất');
  }

  // Test 7: DELETE /api/blocked/:handle - Gỡ chặn kênh
  {
    console.log('Test 7: DELETE /api/blocked/:handle');
    const req = new Request('http://localhost:8787/api/blocked/@toxicchannel123', {
      method: 'DELETE',
    });
    const res = await worker.fetch(req, env);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Kiểm tra danh sách sau khi gỡ
    const reqGet = new Request('http://localhost:8787/api/blocked');
    const resGet = await worker.fetch(reqGet, env);
    const dataGet = await resGet.json();
    assert.strictEqual(dataGet.count, 0); // Đã chuyển thành inactive
    console.log('  ✅ Pass: Gỡ chặn thành công, kênh không còn trong danh sách active');
  }

  console.log('\n🎉 TOÀN BỘ CÁC BÀI TEST BACKEND API ĐÃ PASS 100%!');
}

runTests().catch(err => {
  console.error('❌ Test thất bại:', err);
  process.exit(1);
});
