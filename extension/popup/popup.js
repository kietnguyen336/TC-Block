document.addEventListener('DOMContentLoaded', () => {
  const blockedCount = document.getElementById('blockedCount');

  chrome.runtime.sendMessage({ action: 'GET_SUMMARY' }, (response) => {
    if (!chrome.runtime.lastError && response?.success) blockedCount.textContent = String(response.blockedCount || 0);
  });

  document.getElementById('openDetails').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('details/details.html') });
  });
  document.getElementById('githubLink').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/kietnguyen336/TC-Block' });
  });
  document.getElementById('donateLink').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/sponsors/kietnguyen336' });
  });
});
