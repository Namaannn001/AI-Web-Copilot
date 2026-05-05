const PROVIDER_MODELS = {
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
    { id: 'gpt-4o', name: 'GPT-4o (Smart)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' }
  ],
  gemini: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash (Fast)' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro (Smart)' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Latest)' }
  ],
  claude: [
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku (Fast)' },
    { id: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet (Smart)' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus (Advanced)' }
  ],
  grok: [
    { id: 'grok-3-mini', name: 'Grok 3 Mini (Fast)' },
    { id: 'grok-3', name: 'Grok 3 (Smart)' }
  ],
  mistral: [
    { id: 'mistral-small-latest', name: 'Mistral Small' },
    { id: 'mistral-large-latest', name: 'Mistral Large' }
  ]
};

const PROVIDER_LINKS = {
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
  claude: 'https://console.anthropic.com/settings/keys',
  grok: 'https://console.x.ai/',
  mistral: 'https://console.mistral.ai/api-keys/'
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
    const settings = data.copilot_settings || { provider: 'openai', model: 'gpt-4o-mini', apiKey: '' };
    els.provider.value = settings.provider || 'openai';
    updateModelOptions();
    els.model.value = settings.model || 'gpt-4o-mini';
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
els.provider.addEventListener('change', updateModelOptions);
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
