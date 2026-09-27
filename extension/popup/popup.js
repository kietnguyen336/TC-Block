/**
 * TC-Block Popup Logic
 * Quản lý danh sách kênh bị chặn, tìm kiếm, gỡ chặn, và cấu hình API đồng bộ.
 * 100% không sử dụng emoji.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const syncBtn = document.getElementById('syncBtn');
  const syncIcon = document.getElementById('syncIcon');
  const settingsToggleBtn = document.getElementById('settingsToggleBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const apiUrlInput = document.getElementById('apiUrlInput');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const reporterToken = document.getElementById('reporterToken');
  const clearToken = document.getElementById('clearToken');
  const pendingStatus = document.getElementById('pendingStatus');
  const allowedList = document.getElementById('allowedList');
  const blockedCountEl = document.getElementById('blockedCount');
  const hiddenCountEl = document.getElementById('hiddenCount');
  const searchInput = document.getElementById('searchInput');
  const listContainer = document.getElementById('listContainer');
  const emptyState = document.getElementById('emptyState');
  const emptyText = document.getElementById('emptyText');

  // SVG Icons (Material Design - Không emoji)
  const SVG_TRASH = `
    <svg viewBox="0 0 24 24" class="tc-icon-svg">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>
  `;

  let channelsData = {};
  let currentSearchQuery = '';

  // 1. Tải dữ liệu ban đầu từ Service Worker
  function loadData() {
    chrome.runtime.sendMessage({ action: 'GET_BLOCKED_CHANNELS' }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        statusText.textContent = 'Mất kết nối';
        statusPill.style.background = '#FCE8E6';
        statusPill.querySelector('.tc-status-dot').style.background = '#D93025';
        return;
      }

      channelsData = res.channels || {};
      apiUrlInput.value = res.apiUrl || 'http://localhost:8787';
      statusText.textContent = res.syncError ? 'Đồng bộ lỗi' : res.lastSyncTime ? 'Đã đồng bộ' : 'Chưa đồng bộ';
      pendingStatus.textContent = res.pendingCount ? `${res.pendingCount} báo cáo chưa gửi. ${res.pendingError || 'Bấm đồng bộ để thử lại.'}` : 'Chỉ các kênh được duyệt mới bị chặn cộng đồng.';
      allowedList.replaceChildren();
      Object.values(res.allowed || {}).forEach(channel => {
        const row = document.createElement('div');
        row.className = 'tc-channel-item';
        const label = document.createElement('span');
        label.textContent = channel.channel_name || channel.channel_handle;
        const button = document.createElement('button');
        button.textContent = 'Bỏ ngoại lệ';
        button.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'REMOVE_EXCEPTION', handle: channel.channel_handle }, reply => {
          if (chrome.runtime.lastError || !reply?.success) { pendingStatus.textContent = 'Không thể bỏ ngoại lệ'; return; }
          loadData();
        }));
        row.append(label, button); allowedList.append(row);
      });
      chrome.runtime.sendMessage({ action: 'GET_SETTINGS' }, settings => {
        if (chrome.runtime.lastError || !settings?.success) return;
        document.getElementById('tokenHelp').textContent = settings.hasToken ? 'Đã lưu mã báo cáo cho máy chủ này.' : 'Chưa có mã: báo cáo được giữ trên máy cho đến khi thêm mã.';
      });

      // Cập nhật thống kê
      const totalBlocked = Object.keys(channelsData).length;
      blockedCountEl.textContent = totalBlocked;
      hiddenCountEl.textContent = res.hiddenCount || 0;

      renderList();
    });
  }

  // 2. Render danh sách kênh bị chặn
  function renderList() {
    listContainer.innerHTML = '';

    const list = Object.values(channelsData);
    const query = currentSearchQuery.trim().toLowerCase();

    const filtered = list.filter(item => {
      if (!query) return true;
      const name = (item.channel_name || '').toLowerCase();
      const handle = (item.channel_handle || '').toLowerCase();
      const reason = (item.reason || '').toLowerCase();
      return name.includes(query) || handle.includes(query) || reason.includes(query);
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      if (query) {
        emptyText.textContent = 'Không tìm thấy kết quả phù hợp';
      } else {
        emptyText.textContent = 'Chưa có kênh nào trong danh sách chặn';
      }
      return;
    }

    emptyState.style.display = 'none';

    filtered.forEach(channel => {
      const itemEl = document.createElement('div');
      itemEl.className = 'tc-channel-item';

      const initialLetter = (channel.channel_name || channel.channel_handle || 'K')
        .replace('@', '')
        .trim()
        .charAt(0)
        .toUpperCase();

      itemEl.innerHTML = `
        <div class="tc-channel-left">
          <div class="tc-avatar">${escapeHTML(initialLetter)}</div>
          <div class="tc-channel-details">
            <div class="tc-name-row">
              <span class="tc-item-name" title="${escapeHTML(channel.channel_name)}">${escapeHTML(channel.channel_name)}</span>
              <span class="tc-item-handle">${escapeHTML(channel.channel_handle)}</span>
            </div>
            <div class="tc-item-reason" title="${escapeHTML(channel.reason)}">${escapeHTML(channel.reason)}</div>
            <small>${channel.source === 'personal' ? 'Chặn riêng' : 'Cộng đồng đã duyệt'}</small>
          </div>
        </div>
        <button class="tc-unblock-btn" title="Vẫn hiện kênh này (chỉ cho bạn)" aria-label="Vẫn hiện kênh này (chỉ cho bạn)" data-handle="${escapeHTML(channel.channel_handle)}">
          ${SVG_TRASH}
        </button>
      `;

      // Xử lý nút gỡ chặn
      const unblockBtn = itemEl.querySelector('.tc-unblock-btn');
      unblockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleUnblock(channel.channel_handle, itemEl);
      });

      listContainer.appendChild(itemEl);
    });
  }

  // 3. Xử lý gỡ chặn một kênh
  function handleUnblock(handle, element) {
    element.style.opacity = '0.3';
    element.style.pointerEvents = 'none';

    chrome.runtime.sendMessage({ action: 'UNBLOCK_CHANNEL', handle }, (res) => {
      if (res && res.success) {
        delete channelsData[handle];
        blockedCountEl.textContent = Object.keys(channelsData).length;
        element.style.transform = 'translateX(20px)';
        element.style.transition = 'all 0.2s ease';
        setTimeout(() => {
          loadData();
        }, 200);
      } else {
        element.style.opacity = '1';
        element.style.pointerEvents = 'auto';
        alert('Không thể gỡ chặn. Vui lòng thử lại.');
      }
    });
  }

  // 4. Tìm kiếm tức thì khi người dùng gõ
  searchInput.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value;
    renderList();
  });

  // 5. Nút Đồng bộ ngay từ Cloudflare Worker
  syncBtn.addEventListener('click', () => {
    syncIcon.classList.add('spinning');
    statusText.textContent = 'Đang đồng bộ...';

    chrome.runtime.sendMessage({ action: 'FORCE_SYNC' }, (res) => {
      const failed = chrome.runtime.lastError || !res?.success;
      setTimeout(() => {
        syncIcon.classList.remove('spinning');
        statusText.textContent = failed ? 'Đồng bộ thất bại' : 'Đã đồng bộ';
        if (failed) pendingStatus.textContent = res?.error || 'Không thể kết nối';
        if (res && res.success) {
          channelsData = res.channels || {};
          blockedCountEl.textContent = Object.keys(channelsData).length;
          loadData();
        }
      }, 400);
    });
  });

  // 6. Bật/tắt bảng cấu hình API URL
  settingsToggleBtn.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'block' : 'none';
  });

  // 7. Lưu cấu hình API URL mới
  saveApiBtn.addEventListener('click', () => {
    const newUrl = (apiUrlInput.value || '').trim();
    if (!newUrl) return;

    saveApiBtn.textContent = 'Đang lưu...';
    chrome.runtime.sendMessage({ action: 'SET_SETTINGS', url: newUrl, token: reporterToken.value, clearToken: clearToken.checked }, (res) => {
      if (chrome.runtime.lastError || !res?.success) {
        saveApiBtn.textContent = 'Lưu';
        pendingStatus.textContent = res?.error || 'Không thể lưu cài đặt';
        return;
      }
      reporterToken.value = ''; clearToken.checked = false;
      saveApiBtn.textContent = 'Đã lưu';
      setTimeout(() => {
        saveApiBtn.textContent = 'Lưu';
        settingsPanel.style.display = 'none';
        loadData();
      }, 700);
    });
  });

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Khởi động
  loadData();
});
