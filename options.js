const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

chrome.storage.local.get('apiKey', ({ apiKey }) => {
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
});

saveBtn.addEventListener('click', () => {
  const value = apiKeyInput.value.trim();
  chrome.storage.local.set({ apiKey: value }, () => {
    statusEl.textContent = value ? 'Saved.' : 'Key cleared.';
    setTimeout(() => (statusEl.textContent = ''), 2000);
  });
});
