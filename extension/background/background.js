/**
 * TC-Block Extension Service Worker (Manifest V3)
 * Xử lý đồng bộ danh sách kênh bị chặn với Backend Cloudflare Worker,
 * quản lý bộ nhớ đệm (Cache) và điều phối tin nhắn giữa Content Scripts và Popup.
 */

const DEFAULT_API_URL = 'http://localhost:8787';
const SYNC_ALARM_NAME = 'tc_block_sync_alarm';
const SYNC_INTERVAL_MINUTES = 10;

// Lấy URL API hiện tại từ cấu hình lưu trữ
async function getApiUrl() {
  const result = await chrome.storage.local.get(['tc_api_url']);
  return result.tc_api_url || DEFAULT_API_URL;
}

// Lấy bản đồ danh sách kênh bị chặn từ storage local
async function getBlockedMap() {
  const result = await chrome.storage.local.get(['tc_blocked_channels']);
  return result.tc_blocked_channels || {};
}

// Lưu bản đồ kênh bị chặn vào storage local
async function saveBlockedMap(map) {
  await chrome.storage.local.set({
    tc_blocked_channels: map,
    tc_last_sync_time: new Date().toISOString(),
  });
}

// Phát tin nhắn đến tất cả các tab YouTube đang mở
async function broadcastToYouTubeTabs(messagePayload) {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, messagePayload).catch(() => {
          // Bỏ qua lỗi nếu tab chưa load xong content script
        });
      }
    }
  } catch (e) {
    console.warn('[TC-Block] Không thể phát tin nhắn tới các tab:', e);
  }
}

// Đồng bộ danh sách kênh bị chặn từ Backend Cloudflare Worker
async function syncBlockedChannels() {
  try {
    const apiUrl = await getApiUrl();
    const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/blocked`;

    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = await response.json();
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error('Dữ liệu API trả về không đúng cấu trúc');
    }

    // Chuyển mảng kênh thành Map dạng { [handle]: channelInfo }
    const newMap = {};
    for (const item of json.data) {
      if (item.channel_handle) {
        const handle = item.channel_handle.toLowerCase();
        newMap[handle] = {
          channel_handle: handle,
          channel_name: item.channel_name || handle,
          channel_url: item.channel_url || `https://www.youtube.com/${handle}`,
          reason: item.reason || 'Bị cộng đồng báo cáo',
          report_count: item.report_count || 1,
          updated_at: item.updated_at || new Date().toISOString(),
        };
      }
    }

    await saveBlockedMap(newMap);
    console.log(`[TC-Block] Đã đồng bộ thành công ${Object.keys(newMap).length} kênh bị chặn.`);

    // Thông báo cho các tab YouTube cập nhật và ẩn kênh
    broadcastToYouTubeTabs({
      action: 'BLOCKLIST_UPDATED',
      channels: newMap,
    });

    return { success: true, count: Object.keys(newMap).length, channels: newMap };
  } catch (err) {
    console.error('[TC-Block] Lỗi khi đồng bộ từ server:', err);
    return { success: false, error: err.message };
  }
}

// Gửi báo cáo kênh mới lên server và cập nhật cache tức thì
async function submitReport(reportData) {
  try {
    const apiUrl = await getApiUrl();
    const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/reports`;

    let cleanHandle = (reportData.channel_handle || '').trim().toLowerCase();
    if (!cleanHandle.startsWith('@')) {
      cleanHandle = '@' + cleanHandle;
    }

    const payload = {
      channel_handle: cleanHandle,
      channel_name: reportData.channel_name || cleanHandle,
      channel_url: reportData.channel_url || `https://www.youtube.com/${cleanHandle}`,
      reason: reportData.reason || 'Nội dung không phù hợp',
    };

    // 1. Cập nhật ngay vào cache local để người dùng thấy kết quả tức thì
    const currentMap = await getBlockedMap();
    currentMap[cleanHandle] = {
      ...payload,
      report_count: (currentMap[cleanHandle]?.report_count || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    await saveBlockedMap(currentMap);

    // 2. Báo cho tất cả các tab YouTube ẩn kênh này ngay lập tức
    broadcastToYouTubeTabs({
      action: 'CHANNEL_BLOCKED_EVENT',
      channel: currentMap[cleanHandle],
      channels: currentMap,
    });

    // 3. Gửi lên Cloudflare Worker API
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        console.warn(`[TC-Block] API trả về status ${res.status}, dữ liệu đã được lưu tạm tại local.`);
      }
    } catch (networkErr) {
      console.warn('[TC-Block] Không thể kết nối tới Backend API, đã lưu chặn cục bộ:', networkErr);
    }

    return { success: true, data: currentMap[cleanHandle] };
  } catch (err) {
    console.error('[TC-Block] Lỗi submitReport:', err);
    return { success: false, error: err.message };
  }
}

// Gỡ chặn một kênh
async function unblockChannel(channelHandle) {
  try {
    const cleanHandle = (channelHandle || '').trim().toLowerCase();
    const currentMap = await getBlockedMap();

    if (currentMap[cleanHandle]) {
      delete currentMap[cleanHandle];
      await saveBlockedMap(currentMap);
    }

    // Báo cho các tab cập nhật lại
    broadcastToYouTubeTabs({
      action: 'BLOCKLIST_UPDATED',
      channels: currentMap,
    });

    // Gọi API xóa phía backend
    try {
      const apiUrl = await getApiUrl();
      const endpoint = `${apiUrl.replace(/\/+$/, '')}/api/blocked/${encodeURIComponent(cleanHandle)}`;
      await fetch(endpoint, { method: 'DELETE' });
    } catch (e) {
      console.warn('[TC-Block] Lỗi gọi API xóa kênh:', e);
    }

    return { success: true, handle: cleanHandle };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Khởi tạo Alarm định kỳ
function setupSyncAlarm() {
  chrome.alarms.create(SYNC_ALARM_NAME, {
    periodInMinutes: SYNC_INTERVAL_MINUTES,
  });
}

// Lắng nghe sự kiện cài đặt và khởi động
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TC-Block] Tiện ích đã được cài đặt.');
  setupSyncAlarm();
  syncBlockedChannels();
});

chrome.runtime.onStartup.addListener(() => {
  setupSyncAlarm();
  syncBlockedChannels();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SYNC_ALARM_NAME) {
    syncBlockedChannels();
  }
});

// Điều phối tin nhắn Message Passing
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action;

  if (action === 'GET_BLOCKED_CHANNELS') {
    (async () => {
      const channels = await getBlockedMap();
      const apiUrl = await getApiUrl();
      const meta = await chrome.storage.local.get(['tc_last_sync_time', 'tc_hidden_count']);
      sendResponse({
        success: true,
        channels,
        apiUrl,
        lastSyncTime: meta.tc_last_sync_time,
        hiddenCount: meta.tc_hidden_count || 0,
      });
    })();
    return true; // Cho biết sẽ phản hồi bất đồng bộ (async)
  }

  if (action === 'SUBMIT_REPORT') {
    (async () => {
      const res = await submitReport(message.data);
      sendResponse(res);
    })();
    return true;
  }

  if (action === 'UNBLOCK_CHANNEL') {
    (async () => {
      const res = await unblockChannel(message.handle);
      sendResponse(res);
    })();
    return true;
  }

  if (action === 'FORCE_SYNC') {
    (async () => {
      const res = await syncBlockedChannels();
      sendResponse(res);
    })();
    return true;
  }

  if (action === 'SET_API_URL') {
    (async () => {
      await chrome.storage.local.set({ tc_api_url: message.url });
      const syncRes = await syncBlockedChannels();
      sendResponse({ success: true, syncRes });
    })();
    return true;
  }

  if (action === 'INCREMENT_HIDDEN_COUNT') {
    (async () => {
      const data = await chrome.storage.local.get(['tc_hidden_count']);
      const current = (data.tc_hidden_count || 0) + (message.delta || 1);
      await chrome.storage.local.set({ tc_hidden_count: current });
      sendResponse({ success: true, count: current });
    })();
    return true;
  }
});
