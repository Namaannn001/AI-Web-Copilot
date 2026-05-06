const PROVIDER_MODELS = {
  gemini: [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Preview) — Advanced reasoning & agentic workflows' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview) — High-efficiency & speed' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite (Preview) — Low latency & high-volume' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Stable) — Reliable, high-capability' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Stable) — Best price-performance' }
  ]
};

const PROVIDER_LINKS = {
  gemini: 'https://aistudio.google.com/app/apikey'
};


const els = {
  provider: document.getElementById('provider'),
  model: document.getElementById('model'),
  apikey: document.getElementById('apikey'),
  toggleKeyBtn: document.getElementById('toggle-key'),
  getKeyLink: document.getElementById('get-key-link'),
  btnTest: document.getElementById('btn-test'),
  btnSave: document.getElementById('btn-save'),
  status: document.getElementById('status'),
};

function updateModelOptions() {
  const provider = els.provider.value;
  const models = PROVIDER_MODELS[provider] || [];
  els.model.innerHTML = models.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
  els.getKeyLink.href = PROVIDER_LINKS[provider] || '#';
}

function loadSettings() {
  chrome.storage.local.get('copilot_settings', (data) => {
    const settings = data.copilot_settings || { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: '' };
    // Provider is always gemini (hidden input)
    updateModelOptions();
    els.model.value = settings.model || 'gemini-2.5-flash';
    els.apikey.value = settings.apiKey || '';
  });
}

function saveSettings(showMsg = true) {
  const settings = {
    provider: els.provider.value,
    model: els.model.value,
    apiKey: els.apikey.value.trim()
  };
  
  chrome.storage.local.set({ 'copilot_settings': settings }, () => {
    if (showMsg) {
      setStatus('✅ Settings saved successfully', 'success');
      setTimeout(() => setStatus('', ''), 3000);
    }
  });
}

function setStatus(msg, type) {
  els.status.textContent = msg;
  els.status.className = `status ${type}`;
}

function testApiKey() {
  saveSettings(false);
  setStatus('Testing connection...', '');
  
  const apiKey = els.apikey.value.trim();
  if (!apiKey) {
    setStatus('❌ Please enter an API key first', 'error');
    return;
  }
  
  chrome.runtime.sendMessage({
    type: 'AI_REQUEST',
    payload: {
      mode: 'general',
      context: '',
      question: 'Reply with the single word "OK"'
    }
  }, (response) => {
    if (chrome.runtime.lastError || (response && response.error)) {
      setStatus(`❌ Connection failed: ${response?.error || chrome.runtime.lastError.message}`, 'error');
    } else {
      setStatus('✅ Connection successful! Key is valid.', 'success');
    }
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', loadSettings);
els.btnSave.addEventListener('click', () => saveSettings(true));
els.btnTest.addEventListener('click', testApiKey);

els.toggleKeyBtn.addEventListener('click', () => {
  if (els.apikey.type === 'password') {
    els.apikey.type = 'text';
    els.toggleKeyBtn.textContent = '🙈';
  } else {
    els.apikey.type = 'password';
    els.toggleKeyBtn.textContent = '👁';
  }
});
