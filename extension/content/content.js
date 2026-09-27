/**
 * TC-Block Content Script
 * Quét DOM YouTube, lọc và ẩn các video của kênh bị chặn,
 * inject nút Báo cáo tại 3 vị trí và hiển thị Modal Shadow DOM Material Design (không emoji).
 */

(() => {
  'use strict';

  // Tránh inject script nhiều lần
  if (window.__TC_BLOCK_INJECTED__) return;
  window.__TC_BLOCK_INJECTED__ = true;

  // Bản đồ kênh bị chặn lưu trong bộ nhớ tạm của tab: { [handle]: channelInfo }
  let blockedChannelsMap = {};
  let isScanning = false;
  let scanScheduled = false;
  const RELOAD_EXTENSION_MESSAGE = 'Tiện ích vừa được cập nhật. Hãy tải lại trang YouTube rồi thử lại.';

  function sendRuntimeMessage(message, callback) {
    try {
      if (!globalThis.chrome?.runtime?.id) {
        callback(null, RELOAD_EXTENSION_MESSAGE);
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError?.message || '';
        callback(response, error);
      });
    } catch (error) {
      callback(null, /context invalidated/i.test(error?.message || '') ? RELOAD_EXTENSION_MESSAGE : 'Không thể kết nối với tiện ích.');
    }
  }

  // Biểu tượng SVG Material Design (Tuyệt đối không dùng emoji)
  const ICONS = {
    flag: `<svg viewBox="0 0 24 24"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/></svg>`,
    shieldAlert: `<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    spinner: `<svg viewBox="0 0 24 24" class="tc-spinner"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2.5" fill="none" stroke-dasharray="38" stroke-linecap="round"/></svg>`,
  };

  // Trích xuất channel handle từ URL href
  function extractChannelHandle(href) {
    if (!href) return null;
    try {
      const url = new URL(href, window.location.origin);
      const pathname = decodeURIComponent(url.pathname).normalize('NFC');

      // Dạng 1: /@handle (ví dụ: /@toxicchannel)
      const handleMatch = pathname.match(/^\/(@[\p{L}\p{M}\p{N}_.-]+)(?:\/|$)/u);
      if (handleMatch) {
        return handleMatch[1].toLowerCase();
      }

      // Dạng 2: /channel/UC...
      const channelMatch = pathname.match(/\/channel\/([A-Za-z0-9_-]+)/);
      if (channelMatch) {
        return channelMatch[1];
      }

      // Dạng 3: /c/CustomName hoặc /user/UserName
      const customMatch = pathname.match(/\/(?:c|user)\/([A-Za-z0-9_.-]+)/);
      if (customMatch) {
        return '@' + customMatch[1].toLowerCase();
      }
    } catch (e) {
      // Bỏ qua lỗi URL
    }
    return null;
  }

  // Trích xuất thông tin kênh từ một thẻ video (Video Card Renderer)
  function extractChannelInfoFromCard(cardElement) {
    const linkSelectors = [
      'yt-content-metadata-view-model a[href^="/@"]',
      '.yt-lockup-metadata-view-model__avatar a[href^="/@"]',
      'yt-avatar-shape a[href^="/@"]',
      'a[href^="/@"]',
      'a.yt-simple-endpoint[href*="/@"]',
      'ytd-channel-name a[href*="/@"]',
      'a#channel-name',
      'ytd-channel-name a',
      '#channel-info a[href*="/@"]',
      'a[href^="/channel/"]',
    ];

    let handle = null;
    let name = '';
    let url = '';

    for (const sel of linkSelectors) {
      const a = cardElement.querySelector(sel);
      if (a && a.getAttribute('href')) {
        const h = extractChannelHandle(a.getAttribute('href'));
        if (h) {
          handle = h;
          const textName = (a.textContent || '').trim();
          const ariaName = (a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
          name = textName && textName.toLocaleLowerCase() !== handle.toLocaleLowerCase()
            ? textName
            : ariaName;
          url = a.href || `https://www.youtube.com/${handle}`;
          break;
        }
      }
    }

    if (!handle) return null;
    if (!name) name = handle;

    return { channel_handle: handle, channel_name: name, channel_url: url };
  }

  // 1. Module Lọc và Ẩn Thẻ Video Trên YouTube
  function filterAndProcessCard(card) {
    const info = extractChannelInfoFromCard(card);
    if (!info) return;

    if (card.getAttribute('data-tc-handle') !== info.channel_handle) {
      card.querySelector('.tc-card-report-btn')?.remove();
    }

    // Đánh dấu đã quét thông tin
    card.setAttribute('data-tc-processed', 'true');
    card.setAttribute('data-tc-handle', info.channel_handle);

    // Kiểm tra xem kênh có nằm trong danh sách chặn không
    if (blockedChannelsMap[info.channel_handle]) {
      card.classList.add('tc-channel-blocked');
      card.setAttribute('data-tc-blocked', 'true');
      return;
    }

    card.classList.remove('tc-channel-blocked', 'tc-channel-fading');
    card.removeAttribute('data-tc-blocked');
    // Nếu không bị chặn, inject nút Báo cáo nhanh lên thẻ video (nếu chưa có)
    injectCardReportButton(card, info);
  }

  // Inject nút cờ báo cáo nhanh lên góc thẻ video
  function injectCardReportButton(card, info) {
    if (card.querySelector('.tc-card-report-btn')) return;

    // Tìm container thumbnail để đặt icon
    const targetContainer = card.querySelector('#thumbnail') ||
                            card.querySelector('ytd-thumbnail') ||
                            card.querySelector('yt-thumbnail-view-model') ||
                            card.querySelector('.yt-lockup-view-model__content-image') ||
                            card.querySelector('#details') ||
                            card;

    if (!targetContainer) return;

    // Đảm bảo targetContainer có position relative
    const computedPos = window.getComputedStyle(targetContainer).position;
    if (computedPos === 'static') {
      targetContainer.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = 'tc-card-report-btn';
    btn.type = 'button';
    btn.title = `Chặn kênh ${info.channel_name}`;
    btn.setAttribute('aria-label', `Chặn kênh ${info.channel_name}`);
    btn.innerHTML = ICONS.flag;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openReportModal(info);
    });

    targetContainer.appendChild(btn);
  }

  // 2. Inject Nút Báo Cáo trên Trang xem video (/watch)
  function injectWatchPageButton() {
    if (!window.location.pathname.startsWith('/watch')) return;
    if (document.querySelector('.tc-watch-report-btn')) return;

    // Khu vực chứa nút Đăng ký (Subscribe) và thông tin kênh
    const ownerContainer = document.querySelector('#owner') ||
                           document.querySelector('#owner-sub-count')?.parentElement ||
                           document.querySelector('#subscribe-button') ||
                           document.querySelector('ytd-watch-metadata #owner');

    if (!ownerContainer) return;

    // Lấy thông tin kênh từ trang xem video
    const channelLinkEl = ownerContainer.querySelector('a.yt-simple-endpoint[href*="/@"]') ||
                          ownerContainer.querySelector('ytd-channel-name a') ||
                          document.querySelector('#upload-info ytd-channel-name a');

    if (!channelLinkEl) return;

    const handle = extractChannelHandle(channelLinkEl.getAttribute('href'));
    if (!handle) return;

    const linkText = (channelLinkEl.textContent || '').trim();
    const linkLabel = (channelLinkEl.getAttribute('aria-label') || channelLinkEl.getAttribute('title') || '').trim();
    const name = linkText && linkText.toLocaleLowerCase() !== handle.toLocaleLowerCase()
      ? linkText
      : (linkLabel || handle);
    const info = {
      channel_handle: handle,
      channel_name: name,
      channel_url: channelLinkEl.href || `https://www.youtube.com/${handle}`,
    };

    const btn = document.createElement('button');
    btn.className = 'tc-injected-report-btn tc-watch-report-btn';
    btn.type = 'button';
    btn.innerHTML = `${ICONS.shieldAlert} <span>Chặn kênh</span>`;
    btn.title = `Chặn kênh ${name}`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openReportModal(info);
    });

    // Chèn cạnh nút Subscribe
    const subscribeBtn = ownerContainer.querySelector('#subscribe-button') || ownerContainer;
    subscribeBtn.parentNode.insertBefore(btn, subscribeBtn.nextSibling);
  }

  // 3. Inject Nút Báo Cáo trên Trang chủ kênh (/@handle)
  function injectChannelPageButton() {
    const path = window.location.pathname;
    if (!path.startsWith('/@') && !path.startsWith('/channel/')) return;
    if (document.querySelector('.tc-channel-header-btn')) return;

    const channelHeader = document.querySelector('yt-page-header-renderer') ||
                          document.querySelector('#channel-header') ||
                          document.querySelector('ytd-c4-tabbed-header-renderer') ||
                          document.querySelector('#channel-header-container');
    const subscribeButton = channelHeader?.querySelector('yt-subscribe-button-view-model') ||
                            channelHeader?.querySelector('ytd-subscribe-button-renderer') ||
                            channelHeader?.querySelector('#subscribe-button');
    const headerActions = channelHeader?.querySelector('.page-header-view-model-wiz__page-header-actions') ||
                          channelHeader?.querySelector('yt-flexible-actions-view-model') ||
                          channelHeader?.querySelector('#buttons') ||
                          subscribeButton?.parentElement;

    if (!headerActions) return;

    const handle = extractChannelHandle(window.location.href);
    if (!handle) return;

    const titleEl = channelHeader?.querySelector('h1') ||
                    document.querySelector('.dynamic-text-view-model-wiz__h1') ||
                    document.querySelector('#channel-name') ||
                    document.querySelector('ytd-channel-name');
    const headingName = (titleEl?.textContent || '').trim();
    const metadataName = (document.querySelector('meta[itemprop="name"]')?.getAttribute('content') || '').trim();
    const documentName = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    const name = [headingName, metadataName, documentName]
      .find(value => value && value.toLocaleLowerCase() !== handle.toLocaleLowerCase()) || handle;

    const info = {
      channel_handle: handle,
      channel_name: name,
      channel_url: window.location.href,
    };

    const btn = document.createElement('button');
    btn.className = 'tc-injected-report-btn tc-channel-header-btn';
    btn.type = 'button';
    btn.innerHTML = `${ICONS.shieldAlert} <span>Chặn kênh</span>`;
    btn.title = `Chặn kênh ${name}`;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openReportModal(info);
    });

    if (subscribeButton?.parentElement === headerActions) {
      headerActions.insertBefore(btn, subscribeButton.nextSibling);
    } else {
      headerActions.appendChild(btn);
    }
  }

  function getCurrentPageChannelInfo() {
    const path = window.location.pathname;
    if (path.startsWith('/@') || path.startsWith('/channel/')) {
      const handle = extractChannelHandle(window.location.href);
      if (!handle) return null;
      const header = document.querySelector('yt-page-header-renderer') || document.querySelector('#channel-header');
      const heading = (header?.querySelector('h1')?.textContent || document.querySelector('#channel-name')?.textContent || '').trim();
      const pageName = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
      return { channel_handle: handle, channel_name: heading || pageName || handle, channel_url: window.location.href };
    }
    if (!path.startsWith('/watch')) return null;
    const owner = document.querySelector('#owner') || document.querySelector('ytd-watch-metadata #owner');
    const link = owner?.querySelector('a[href^="/@"], a[href^="/channel/"]') || document.querySelector('#upload-info ytd-channel-name a');
    if (!link) return null;
    const handle = extractChannelHandle(link.getAttribute('href'));
    if (!handle) return null;
    const text = (link.textContent || '').trim();
    const label = (link.getAttribute('aria-label') || link.getAttribute('title') || '').trim();
    return { channel_handle: handle, channel_name: text || label || handle, channel_url: link.href || `https://www.youtube.com/${handle}` };
  }

  function enforceCurrentPageBlock() {
    const current = getCurrentPageChannelInfo();
    const blocked = current && blockedChannelsMap[current.channel_handle];
    const existing = document.getElementById('tc-page-block-overlay');
    if (!blocked) {
      existing?.remove();
      return;
    }

    document.querySelectorAll('video').forEach(video => video.pause());
    if (existing?.getAttribute('data-tc-handle') === current.channel_handle) return;
    existing?.remove();

    const overlay = document.createElement('section');
    overlay.id = 'tc-page-block-overlay';
    overlay.setAttribute('data-tc-handle', current.channel_handle);
    overlay.setAttribute('role', 'alert');
    const icon = document.createElement('div');
    icon.className = 'tc-page-block-icon';
    icon.innerHTML = ICONS.shieldAlert;
    const title = document.createElement('h2');
    title.textContent = 'Kênh này đã bị chặn';
    const copy = document.createElement('p');
    const displayName = current.channel_name && current.channel_name.toLocaleLowerCase() !== current.channel_handle.toLocaleLowerCase()
      ? current.channel_name : (blocked.channel_name || current.channel_handle);
    copy.textContent = `TC-Block đã ẩn trang và toàn bộ nội dung của ${displayName}.`;
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Quay lại YouTube';
    back.addEventListener('click', () => { window.location.href = 'https://www.youtube.com/'; });
    overlay.append(icon, title, copy, back);
    document.body.appendChild(overlay);
  }

  // Quét toàn bộ DOM để lọc video
  function scanAndFilterDOM() {
    isScanning = true;

    // Tất cả các loại thẻ video trên YouTube
    const cardSelectors = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-reel-video-renderer',
      'ytd-reel-item-renderer',
      'ytd-channel-renderer',
      'yt-lockup-view-model',
      'yt-video-view-model',
      'ytm-shorts-lockup-view-model',
    ];

    const cards = document.querySelectorAll(cardSelectors.join(','));
    for (let i = 0; i < cards.length; i++) {
      filterAndProcessCard(cards[i]);
    }

    injectWatchPageButton();
    injectChannelPageButton();
    enforceCurrentPageBlock();

    isScanning = false;
  }

  // Lên lịch quét DOM có debounce 40ms kết hợp requestAnimationFrame
  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;

    setTimeout(() => {
      window.requestAnimationFrame(() => {
        scanAndFilterDOM();
        scanScheduled = false;
      });
    }, 40);
  }

  // 4. Modal Báo Cáo Material Design Đóng Gói Trong Shadow DOM
  function openReportModal(channelInfo) {
    // Xóa modal cũ nếu đang mở
    const existing = document.getElementById('tc-block-modal-host');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = 'tc-block-modal-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Styles Material Design bên trong Shadow DOM
    const style = document.createElement('style');
    style.textContent = `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: "Roboto", "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif;
      }

      .tc-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999999;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 15, 15, 0.55);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        opacity: 0;
        animation: tcFadeIn 0.22s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
      }

      .tc-card {
        position: relative;
        width: 100%;
        max-width: 480px;
        margin: 16px;
        background: #FFFFFF;
        border-radius: 20px;
        border: 1px solid #FFD8DE;
        box-shadow: 0 16px 48px rgba(204, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08);
        overflow: hidden;
        transform: scale(0.94);
        animation: tcCardPop 0.25s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
      }

      .tc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px 16px;
        border-bottom: 1px solid #F5E6E8;
      }

      .tc-title-box {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .tc-icon-badge {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: #FFF0F2;
        border: 1px solid #FFCCD2;
      }

      .tc-icon-badge svg {
        width: 22px;
        height: 22px;
        fill: #CC0000;
      }

      .tc-title {
        font-size: 18px;
        font-weight: 600;
        color: #1F1F1F;
        letter-spacing: -0.2px;
      }

      .tc-subtitle {
        font-size: 13px;
        color: #606060;
        margin-top: 2px;
      }

      .tc-close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        color: #717171;
        transition: background 0.15s ease;
      }

      .tc-close-btn:hover {
        background: #F2F2F2;
        color: #111;
      }

      .tc-close-btn svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
      }

      .tc-body {
        padding: 20px 24px;
      }

      .tc-channel-pill {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: #FFF0F2;
        border: 1px solid #FFD0D6;
        border-radius: 14px;
        margin-bottom: 18px;
      }

      .tc-channel-name {
        font-size: 15px;
        font-weight: 600;
        color: #900000;
      }

      .tc-channel-handle {
        font-size: 13px;
        color: #C00015;
        margin-top: 2px;
      }

      .tc-label {
        display: block;
        font-size: 13.5px;
        font-weight: 500;
        color: #2E2E2E;
        margin-bottom: 8px;
      }

      .tc-textarea {
        width: 100%;
        min-height: 85px;
        padding: 12px 14px;
        background: #FAFAFA;
        border: 1px solid #D1D5DB;
        border-radius: 12px;
        font-size: 13.5px;
        color: #1F2937;
        resize: vertical;
        outline: none;
        transition: border-color 0.18s ease, box-shadow 0.18s ease;
      }

      .tc-textarea:focus {
        background: #FFFFFF;
        border-color: #CC0000;
        box-shadow: 0 0 0 3px rgba(204, 0, 0, 0.12);
      }

      .tc-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
        padding: 16px 24px 20px;
        border-top: 1px solid #F5E6E8;
      }

      .tc-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 40px;
        padding: 0 18px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border: none;
      }

      .tc-btn-secondary {
        background: transparent;
        color: #4B5563;
      }

      .tc-btn-secondary:hover {
        background: #F3F4F6;
        color: #111;
      }

      .tc-btn-primary {
        background: #CC0000;
        color: #FFFFFF;
        box-shadow: 0 4px 14px rgba(204, 0, 0, 0.25);
      }

      .tc-btn-primary:hover {
        background: #B30000;
        box-shadow: 0 6px 18px rgba(204, 0, 0, 0.35);
      }

      .tc-btn-primary:active {
        transform: scale(0.98);
      }

      .tc-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .tc-spinner {
        width: 18px;
        height: 18px;
        animation: tcSpin 0.9s linear infinite;
      }

      @keyframes tcFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes tcCardPop {
        from { transform: scale(0.94); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
      }

      @keyframes tcSpin {
        100% { transform: rotate(360deg); }
      }
    `;

    const modalHTML = `
      <div class="tc-backdrop" id="backdrop">
        <div class="tc-card" role="dialog" aria-modal="true">
          <div class="tc-header">
            <div class="tc-title-box">
              <div class="tc-icon-badge">
                ${ICONS.shieldAlert}
              </div>
              <div>
                <h2 class="tc-title">Báo Cáo & Chặn Kênh</h2>
                <p class="tc-subtitle">Chặn riêng ngay. Chỉ chặn cộng đồng sau khi được duyệt.</p>
              </div>
            </div>
            <button class="tc-close-btn" id="closeBtn" title="Đóng">
              ${ICONS.close}
            </button>
          </div>

          <div class="tc-body">
            <div class="tc-channel-pill">
              <div>
                <div class="tc-channel-name">${escapeHTML(channelInfo.channel_name)}</div>
                <div class="tc-channel-handle">${escapeHTML(channelInfo.channel_handle)}</div>
              </div>
            </div>

            <label class="tc-label" for="reasonInput">Lý do báo cáo</label>
            <textarea class="tc-textarea" id="reasonInput" maxlength="2000" placeholder="Nhập lý do muốn báo cáo và chặn kênh này..."></textarea>
            <p id="reportError" role="alert"></p>
          </div>

          <div class="tc-footer">
            <button class="tc-btn tc-btn-secondary" id="cancelBtn" type="button">Hủy bỏ</button>
            <button class="tc-btn tc-btn-primary" id="submitBtn" type="button">
              <span>Gửi Báo Cáo & Chặn Kênh</span>
            </button>
          </div>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = modalHTML;
    shadow.appendChild(wrapper);

    const backdrop = shadow.getElementById('backdrop');
    const closeBtn = shadow.getElementById('closeBtn');
    const cancelBtn = shadow.getElementById('cancelBtn');
    const submitBtn = shadow.getElementById('submitBtn');
    const reasonInput = shadow.getElementById('reasonInput');

    const closeModal = () => {
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 0.18s ease';
      setTimeout(() => host.remove(), 180);
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    submitBtn.addEventListener('click', async () => {
      const reason = (reasonInput.value || '').trim();
      if (!reason) {
        reasonInput.focus();
        reasonInput.style.borderColor = '#CC0000';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = `${ICONS.spinner} <span>Đang xử lý...</span>`;

      // Gửi báo cáo thông qua Service Worker
      sendRuntimeMessage({
        action: 'SUBMIT_REPORT',
        data: {
          channel_handle: channelInfo.channel_handle,
          channel_name: channelInfo.channel_name,
          channel_url: channelInfo.channel_url,
          reason: reason,
        },
      }, (res, runtimeError) => {
        if (runtimeError || !res?.success) {
          shadow.getElementById('reportError').textContent = runtimeError || res?.error || 'Không thể lưu báo cáo. Vui lòng thử lại.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Thử lại';
          return;
        }
        closeModal();

        // Cập nhật bộ nhớ cục bộ và ẩn ngay lập tức
        blockedChannelsMap[channelInfo.channel_handle] = {
          ...channelInfo,
          reason,
        };

        // Ẩn mượt mà các video của kênh này đang có trên trang
        hideVideosOfChannel(channelInfo.channel_handle);
        enforceCurrentPageBlock();

        // Hiển thị Toast thông báo thành công
        showSuccessToast(channelInfo, res);
      });
    });
  }

  // Ẩn ngay lập tức các video của một kênh cụ thể
  function hideVideosOfChannel(channelHandle) {
    const cards = document.querySelectorAll(`[data-tc-handle="${CSS.escape(channelHandle)}"]`);
    cards.forEach(card => {
      card.classList.add('tc-channel-fading');
      setTimeout(() => {
        if (!blockedChannelsMap[channelHandle] || card.getAttribute('data-tc-handle') !== channelHandle) return;
        card.classList.remove('tc-channel-fading');
        card.classList.add('tc-channel-blocked');
        card.setAttribute('data-tc-blocked', 'true');
      }, 250);
    });
  }

  // Hiển thị Toast thông báo phong cách Material Design (Trắng & Đỏ hồng, không emoji)
  function showSuccessToast(channelInfo, result) {
    const existing = document.getElementById('tc-toast-host');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = 'tc-toast-host';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .tc-toast {
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 99999999;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: #FFFFFF;
        border: 1px solid #FFD0D6;
        border-radius: 16px;
        box-shadow: 0 10px 30px rgba(204, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.06);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #1F1F1F;
        font-family: "Roboto", "Segoe UI", Arial, sans-serif;
        font-size: 14px;
        font-weight: 500;
        animation: tcToastSlide 0.28s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
      }

      .tc-toast-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #FFF0F2;
        color: #CC0000;
      }

      .tc-toast-icon svg {
        width: 18px;
        height: 18px;
        fill: currentColor;
      }

      .tc-toast-content {
        line-height: 1.4;
      }

      .tc-toast-bold {
        color: #CC0000;
        font-weight: 600;
      }

      @keyframes tcToastSlide {
        from { transform: translateY(30px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    const toastHTML = `
      <div class="tc-toast">
        <div class="tc-toast-icon">
          ${ICONS.check}
        </div>
        <div class="tc-toast-content">
          Đã chặn riêng kênh <span class="tc-toast-bold">${escapeHTML(channelInfo.channel_name)}</span>.
          <br>${result?.queued ? 'Báo cáo chưa gửi. Mở popup để xem trạng thái và thử lại.' : 'Đã gửi báo cáo. Chặn cộng đồng cần quản trị viên duyệt.'}
        </div>
      </div>
    `;

    shadow.appendChild(style);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = toastHTML;
    shadow.appendChild(wrapper);

    setTimeout(() => {
      wrapper.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      wrapper.style.opacity = '0';
      wrapper.style.transform = 'translateY(15px)';
      setTimeout(() => host.remove(), 250);
    }, 4500);
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 5. Khởi tạo và Lắng nghe sự kiện
  function init() {
    // Tải danh sách kênh bị chặn từ Service Worker
    sendRuntimeMessage({ action: 'GET_BLOCKED_CHANNELS' }, (response) => {
      if (response && response.channels) {
        blockedChannelsMap = response.channels;
        scheduleScan();
      }
    });

    // Lắng nghe cập nhật từ Service Worker
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.action === 'BLOCKLIST_UPDATED') {
        blockedChannelsMap = msg.channels || {};
        scheduleScan();
      }
      if (msg?.action === 'CHANNEL_BLOCKED_EVENT') {
        if (msg.channel?.channel_handle) {
          blockedChannelsMap[msg.channel.channel_handle] = msg.channel;
          hideVideosOfChannel(msg.channel.channel_handle);
        }
      }
    });

    // Theo dõi DOM thay đổi với MutationObserver
    const observer = new MutationObserver(() => {
      if (!isScanning) {
        scheduleScan();
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });

    // Lắng nghe điều hướng SPA của YouTube
    window.addEventListener('yt-navigate-finish', () => {
      document.querySelectorAll('.tc-watch-report-btn, .tc-channel-header-btn').forEach(btn => btn.remove());
      scheduleScan();
    });

    // Quét lần đầu
    scheduleScan();
  }

  // Bắt đầu khi DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
