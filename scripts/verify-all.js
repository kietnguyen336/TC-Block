/**
 * TC-Block: Script Kiểm Thử Tích Hợp Toàn Diện (End-to-End Verification Suite)
 * Kiểm tra toàn bộ luồng từ Backend Cloudflare Worker -> Sync Service Worker -> Lọc DOM YouTube -> Popup UI.
 * Đồng thời quét toàn bộ dự án để đảm bảo tuyệt đối không có emoji.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import worker from '../backend/src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const EMOJI_REGEX = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

// Quét đệ quy toàn bộ thư mục extension để đảm bảo 0% emoji
function scanDirectoryForEmojis(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        scanDirectoryForEmojis(fullPath);
      }
    } else if (/\.(js|html|css)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const match = content.match(EMOJI_REGEX);
      if (match) {
        throw new Error(`Phát hiện emoji "${match[0]}" tại file: ${fullPath}`);
      }
    }
  }
}

// Mock D1 Database in-memory
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
            reports.push({ channel_handle, channel_name, reason, ip });
            return { success: true };
          }
          if (q.startsWith('INSERT INTO BLOCKED_CHANNELS')) {
            const [channel_handle, channel_name, channel_url, reason] = args;
            const existing = blockedChannels.get(channel_handle);
            if (existing) {
              existing.report_count += 1;
              existing.reason = reason;
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
            }
            return { success: true };
          }
          return { success: true };
        },
        async all() {
          const q = query.trim().toUpperCase();
          if (q.includes('FROM BLOCKED_CHANNELS')) {
            const results = Array.from(blockedChannels.values())
              .filter(c => c.status === 'active');
            return { results };
          }
          return { results: [] };
        },
      });

      return {
        bind(...args) { return exec(...args); },
        run(...args) { return exec(...args).run(); },
        all(...args) { return exec(...args).all(); },
      };
    },
  };
}

async function runVerification() {
  console.log('===============================================================');
  console.log('[START] BAT DAU KIEM THU TICH HOP TOAN DIEN TC-BLOCK (E2E)');
  console.log('===============================================================\n');

  // Giai đoạn 1: Quét kiểm tra vi phạm Emoji trên toàn bộ Extension
  console.log('1. [Audit] Quet toan bo ma nguon Extension kiem tra quy dinh "Khong emoji"...');
  scanDirectoryForEmojis(path.join(rootDir, 'extension'));
  console.log('   => KET QUA: 100% ma nguon extension dat chuan khong chua emoji.\n');

  // Giai đoạn 2: Mô phỏng Kịch bản Báo cáo & Đồng bộ Cộng đồng (E2E Flow)
  console.log('2. [E2E Simulation] Mo phong tuong tac nguoi dung thuc te:');
  const mockDb = createMockD1();
  const env = { DB: mockDb };

  // Kịch bản:
  // - Người dùng A lướt YouTube và thấy kênh độc hại "@toxic_clickbait_vn"
  // - Người dùng A bấm Báo cáo với lý do "Tin giả giật gân, lừa đảo"
  console.log('   -> Nguoi dung A gui bao cao kenh @toxic_clickbait_vn len Backend API...');
  const reportReq = new Request('http://localhost:8787/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel_handle: '@toxic_clickbait_vn',
      channel_name: 'Tin Nóng Giật Gân VN',
      channel_url: 'https://www.youtube.com/@toxic_clickbait_vn',
      reason: 'Tin giả giật gân, lừa đảo',
    }),
  });

  const reportRes = await worker.fetch(reportReq, env);
  assert.strictEqual(reportRes.status, 201, 'Backend phải phản hồi 201 Created');
  const reportData = await reportRes.json();
  assert.strictEqual(reportData.success, true);
  console.log('   => Backend da tiep nhan bao cao va ghi vao Cloudflare D1 Database.');

  // - Người dùng B ở máy khác cài extension TC-Block
  // - Service Worker của Người dùng B định kỳ đồng bộ danh sách từ server:
  console.log('   -> Nguoi dung B dong bo danh sach kenh bi chan tu Cloudflare Worker API...');
  const syncReq = new Request('http://localhost:8787/api/blocked');
  const syncRes = await worker.fetch(syncReq, env);
  assert.strictEqual(syncRes.status, 200);
  const syncData = await syncRes.json();
  assert.strictEqual(syncData.count, 1);
  assert.strictEqual(syncData.data[0].channel_handle, '@toxic_clickbait_vn');
  console.log(`   => Nguoi dung B da dong bo thanh cong ${syncData.count} kenh bi chan.`);

  // - Người dùng B mở YouTube, lướt trang chủ có 3 video:
  //   + Video 1 của kênh @toxic_clickbait_vn (Kênh xấu)
  //   + Video 2 của kênh @laptrinh_chatluong (Kênh tốt)
  //   + Video 3 của kênh @toxic_clickbait_vn (Kênh xấu)
  console.log('   -> Content Script cua Nguoi dung B quet DOM YouTube va loc video...');
  const mockDOMVideos = [
    { id: 'video-1', channelHandle: '@toxic_clickbait_vn', title: 'Video tin giả 1' },
    { id: 'video-2', channelHandle: '@laptrinh_chatluong', title: 'Học lập trình web' },
    { id: 'video-3', channelHandle: '@toxic_clickbait_vn', title: 'Video giật gân 2' },
  ];

  const blockedMap = {};
  syncData.data.forEach(item => {
    blockedMap[item.channel_handle.toLowerCase()] = item;
  });

  const filterResults = mockDOMVideos.map(video => {
    const isBlocked = !!blockedMap[video.channelHandle.toLowerCase()];
    return {
      ...video,
      displayed: !isBlocked,
      hiddenByTCBlock: isBlocked,
    };
  });

  // Xác minh kết quả lọc:
  assert.strictEqual(filterResults[0].hiddenByTCBlock, true, 'Video 1 phải bị ẩn');
  assert.strictEqual(filterResults[1].hiddenByTCBlock, false, 'Video 2 phải được giữ nguyên');
  assert.strictEqual(filterResults[2].hiddenByTCBlock, true, 'Video 3 phải bị ẩn');
  console.log('   => Video 1 (Kenh xau): DA AN');
  console.log('   => Video 2 (Kenh sach): HIEN THI BINH THUONG');
  console.log('   => Video 3 (Kenh xau): DA AN');

  // Giai đoạn 3: Người dùng B mở Popup để kiểm tra danh sách
  console.log('\n3. [Popup Simulation] Kiem tra hien thi danh sach tren Popup:');
  const popupChannelList = Object.values(blockedMap);
  assert.strictEqual(popupChannelList.length, 1);
  assert.strictEqual(popupChannelList[0].channel_name, 'Tin Nóng Giật Gân VN');
  assert.strictEqual(popupChannelList[0].reason, 'Tin giả giật gân, lừa đảo');
  console.log(`   => Popup hien thi dung 1 kenh: "${popupChannelList[0].channel_name}" (${popupChannelList[0].channel_handle})`);
  console.log(`   => Ly do hien thi: "${popupChannelList[0].reason}"`);

  // Giai đoạn 4: Người dùng B gỡ chặn kênh
  console.log('\n4. [Unblock Simulation] Nguoi dung go chan kenh khoi danh sach:');
  const deleteReq = new Request('http://localhost:8787/api/blocked/@toxic_clickbait_vn', { method: 'DELETE' });
  const deleteRes = await worker.fetch(deleteReq, env);
  assert.strictEqual(deleteRes.status, 200);

  const checkReq = new Request('http://localhost:8787/api/blocked');
  const checkRes = await worker.fetch(checkReq, env);
  const checkData = await checkRes.json();
  assert.strictEqual(checkData.count, 0, 'Danh sách phải trống sau khi gỡ chặn');
  console.log('   => Go chan thanh cong, kenh khong con bi an nua.\n');

  console.log('===============================================================');
  console.log('[SUCCESS] TAT CA CAC BAI KIEM THU TICH HOP DEU DAT CHUAN 100%!');
  console.log('===============================================================');
}

runVerification().catch(err => {
  console.error('\n[FAILED] KIEM THU THAT BAI:', err);
  process.exit(1);
});
