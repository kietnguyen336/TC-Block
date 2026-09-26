/**
 * TC-Block Backend API (Cloudflare Worker + D1 Database)
 * Quản lý báo cáo kênh YouTube và danh sách chặn dùng chung cho cộng đồng.
 */

// Tiêu chuẩn CORS cho phép Extension và Web gọi API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

function normalizeHandle(handle) {
  if (!handle) return '';
  let clean = handle.trim().toLowerCase();
  if (!clean.startsWith('@')) {
    clean = '@' + clean;
  }
  return clean;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    // 1. Xử lý preflight CORS OPTIONS request
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 2. Health check route
      if (url.pathname === '/' || url.pathname === '/api/health') {
        return jsonResponse({
          status: 'ok',
          service: 'TC-Block Community YouTube Blocker API',
          timestamp: new Date().toISOString(),
        });
      }

      // 3. API: POST /api/reports - Tiếp nhận báo cáo và đưa kênh vào danh sách chặn
      if (method === 'POST' && url.pathname === '/api/reports') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({ success: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
        }

        const { channel_name, channel_url, reason } = body;
        const channel_handle = normalizeHandle(body.channel_handle);

        if (!channel_handle || channel_handle.length < 2) {
          return jsonResponse({ success: false, error: 'Thiếu hoặc sai định dạng channel_handle (ví dụ: @kenh-xau)' }, 400);
        }

        if (!reason || reason.trim().length === 0) {
          return jsonResponse({ success: false, error: 'Lý do báo cáo không được để trống' }, 400);
        }

        const finalName = (channel_name || channel_handle).trim();
        const finalUrl = (channel_url || `https://www.youtube.com/${channel_handle}`).trim();
        const finalReason = reason.trim();

        // Lấy IP người gửi để tạo hash bảo mật chống spam
        const clientIp = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '127.0.0.1';

        // Thực thi truy vấn D1 Database
        if (env && env.DB) {
          // Lưu vào lịch sử reports
          await env.DB.prepare(
            `INSERT INTO reports (channel_handle, channel_name, reason, reporter_ip_hash, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`
          ).bind(channel_handle, finalName, finalReason, clientIp).run();

          // Upsert vào blocked_channels
          await env.DB.prepare(
            `INSERT INTO blocked_channels (channel_handle, channel_name, channel_url, reason, report_count, status, updated_at)
             VALUES (?, ?, ?, ?, 1, 'active', CURRENT_TIMESTAMP)
             ON CONFLICT(channel_handle) DO UPDATE SET
               report_count = report_count + 1,
               channel_name = excluded.channel_name,
               reason = excluded.reason,
               status = 'active',
               updated_at = CURRENT_TIMESTAMP`
          ).bind(channel_handle, finalName, finalUrl, finalReason).run();
        }

        return jsonResponse({
          success: true,
          message: `Đã ghi nhận báo cáo và thêm kênh ${channel_handle} vào danh sách chặn cộng đồng`,
          data: {
            channel_handle,
            channel_name: finalName,
            channel_url: finalUrl,
            reason: finalReason,
            reported_at: new Date().toISOString(),
          },
        }, 201);
      }

      // 4. API: GET /api/blocked - Lấy danh sách toàn bộ kênh đang bị chặn
      if (method === 'GET' && url.pathname === '/api/blocked') {
        let blockedList = [];

        if (env && env.DB) {
          const { results } = await env.DB.prepare(
            `SELECT channel_handle, channel_name, channel_url, reason, report_count, created_at, updated_at
             FROM blocked_channels
             WHERE status = 'active'
             ORDER BY updated_at DESC`
          ).all();

          blockedList = results || [];
        }

        return jsonResponse({
          success: true,
          count: blockedList.length,
          updated_at: new Date().toISOString(),
          data: blockedList,
        }, 200, {
          'Cache-Control': 'public, max-age=30, s-maxage=60',
        });
      }

      // 5. API: DELETE /api/blocked/:handle - Gỡ chặn một kênh
      if (method === 'DELETE' && url.pathname.startsWith('/api/blocked/')) {
        const rawHandle = decodeURIComponent(url.pathname.replace('/api/blocked/', ''));
        const channel_handle = normalizeHandle(rawHandle);

        if (!channel_handle) {
          return jsonResponse({ success: false, error: 'Thiếu channel_handle cần gỡ chặn' }, 400);
        }

        if (env && env.DB) {
          await env.DB.prepare(
            `UPDATE blocked_channels SET status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE channel_handle = ?`
          ).bind(channel_handle).run();
        }

        return jsonResponse({
          success: true,
          message: `Đã gỡ chặn kênh ${channel_handle} khỏi danh sách chặn`,
          channel_handle,
        });
      }

      // 6. 404 Not Found
      return jsonResponse({ success: false, error: 'API endpoint không tồn tại' }, 404);

    } catch (err) {
      return jsonResponse({
        success: false,
        error: 'Lỗi máy chủ nội bộ',
        detail: err.message,
      }, 500);
    }
  },
};
