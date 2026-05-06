/**
 * AI Web Copilot – Background Service Worker
 * BYOK (Bring Your Own Key) – calls Google Gemini API directly.
 */

// ── Context Menu Setup ────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  const menuItems = [
    { id: 'copilot-explain',   title: '🧠 Explain this' },
    { id: 'copilot-summarize', title: '📋 Summarize' },
    { id: 'copilot-fakenews', title: '🔍 Check Fake News' },
    { id: 'copilot-notes',    title: '📝 Convert to Notes' },
  ];

  chrome.contextMenus.create({
    id: 'copilot-parent',
    title: '✦ AI Web Copilot',
    contexts: ['selection'],
  });

  menuItems.forEach((item) => {
    chrome.contextMenus.create({
      id: item.id,
      parentId: 'copilot-parent',
      title: item.title,
      contexts: ['selection'],
    });
  });
});

// ── Context Menu Click Handler ────────────────────────────
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  const modeMap = {
    'copilot-explain':   'explain',
    'copilot-summarize': 'summarize',
    'copilot-fakenews':  'fakenews',
    'copilot-notes':     'notes',
  };
  const mode = modeMap[info.menuItemId];
  if (!mode) return;
  chrome.tabs.sendMessage(tab.id, {
    type: 'CONTEXT_MENU_ACTION',
    mode,
    selectedText: info.selectionText,
  });
});

// ── Keyboard Shortcut Handler ─────────────────────────────
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-assistant' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ASSISTANT' });
  }
});

// ── Extension Icon Click Handler ──────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_ASSISTANT' });
  }
});

// ── Message Handler ───────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ opened: true });
    return false;
  }

  if (message.type === 'AI_REQUEST') {
    handleAIRequest(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'AI_STREAM_REQUEST') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ error: 'No tab ID' });
      return false;
    }
    handleStreamRequest(message.payload, tabId);
    sendResponse({ started: true });
    return false;
  }
});

// ── Load settings from storage ────────────────────────────
async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('copilot_settings', (data) => {
      resolve(data.copilot_settings || {});
    });
  });
}

// ── Smart Error Parser ────────────────────────────────────
function parseApiError(status, rawMessage, provider, model = '') {
  const msg = (rawMessage || '').toLowerCase();

  // 401 — Bad API Key
  if (status === 401 || msg.includes('api key not valid') || msg.includes('invalid api key') || msg.includes('unauthenticated')) {
    return '🔑 Invalid API Key. Please double-check your key in Settings and make sure you copied it correctly with no extra spaces.';
  }

  // 403 — Permission / Access denied
  if (status === 403 || msg.includes('permission denied') || msg.includes('forbidden')) {
    if (provider === 'grok' && model === 'grok-4') {
      return '🚫 Grok 4 Access Denied. Grok 4 requires a paid xAI API plan. Please upgrade at console.x.ai/billing or switch to Grok 3 (Free tier) in Settings.';
    }
    return '🚫 Access Denied. Your API key does not have permission to use this model. Try a different model or check your API plan on the provider\'s website.';
  }

  // 404 — Model not found
  if (status === 404 || msg.includes('not found') || msg.includes('not supported')) {
    return `🤖 Model Not Found. The selected model is not available with your API key tier. Try switching to a different model in Settings (e.g. Gemini 2.5 Flash instead of Gemini 3.1 Pro).`;
  }

  // 429 — Quota / Rate Limit
  if (status === 429 || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('resource_exhausted')) {
    return '⏳ Quota Exceeded. You have hit your free usage limit for today. Wait a few minutes and try again, or upgrade your API plan at the provider\'s website.';
  }

  // 500 / 503 — Provider server error
  if (status === 500 || status === 503 || msg.includes('internal server error') || msg.includes('service unavailable') || msg.includes('overloaded')) {
    return `🔧 ${provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : 'AI'} servers are currently overloaded or down. This is not a problem with your key. Please try again in a minute.`;
  }

  // Network failure (no status code)
  if (!status && (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed'))) {
    return '🌐 Network Error. Could not reach the AI provider. Check your internet connection and try again.';
  }

  // No API key set
  if (msg.includes('no api key')) {
    return '⚙️ No API Key found. Click the Settings (⚙️) button to add your API key first.';
  }

  // Fallback — show the raw message but cleanly
  return `❌ ${rawMessage || 'Unknown error. Please try again.'}`;
}

// ── System Prompts ────────────────────────────────────────
const SYSTEM_PROMPTS = {
  explain: `You are an expert educator. Explain the given content in a simple, clear, and concise way.
Use analogies and examples where helpful. Format your response with clear paragraphs.
If the content is technical, break it down step by step.`,

  summarize: `You are a professional summarizer. Provide a structured summary with:
## TL;DR
A single sentence summary.
## Key Points
- Bullet point summary of the main ideas (3-7 points)
## Key Insights
- Notable insights or takeaways
Be concise but thorough. Use markdown formatting.`,

  fakenews: `You are a media literacy analyst. Analyze the given content for credibility.
Provide your analysis in this format:
## Credibility Assessment
**Confidence Level:** [High/Medium/Low] credibility
## Analysis
- Examine claims made in the text
- Look for logical fallacies, emotional manipulation, or unsupported claims
## Red Flags (if any)
- List any concerning patterns
## Reasoning
Explain your assessment clearly.
⚠️ **Disclaimer:** This is an AI-assisted analysis. Always verify with multiple reliable sources.`,

  notes: `You are a note-taking expert. Convert the given content into well-structured notes.
## Main Topic
### Key Concepts
- Use bullet points for individual concepts
### Important Details
- Include relevant details, dates, names, figures
### Key Takeaways
1. Numbered list of main takeaways
Use proper markdown formatting.`,

  general: `You are a helpful AI assistant called "AI Web Copilot". You answer questions about web page content clearly and concisely.
Use markdown formatting for readability. Keep responses focused and actionable.`,
};

function buildMessages(mode, context, userQuestion) {
  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.general;
  let userContent = '';
  if (context) userContent += `**Content/Context:**\n\`\`\`\n${context}\n\`\`\`\n\n`;
  const defaults = {
    explain: 'Explain this content.',
    summarize: 'Summarize this content.',
    fakenews: 'Analyze this content for credibility.',
    notes: 'Convert this content into structured notes.',
    general: 'Help me understand this content.',
  };
  userContent += `**Question:** ${userQuestion || defaults[mode] || defaults.general}`;
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userContent },
  ];
}

// ═══════════════════════════════════════════════════════════
//  PROVIDER ADAPTERS — Non-streaming (AI_REQUEST)
// ═══════════════════════════════════════════════════════════

async function handleAIRequest(payload) {
  const settings = await getSettings();
  const { provider, apiKey, model } = resolveConfig(settings);
  if (!apiKey) throw new Error('No API key set. Open the ⚙️ Settings panel to add your key.');

  const messages = buildMessages(payload.mode, payload.context, payload.question);

  switch (provider) {
    case 'gemini':  return callGemini(apiKey, model, messages);
    case 'claude':  return callClaude(apiKey, model, messages);
    case 'grok':    return callGrok(apiKey, model, messages);
    case 'mistral': return callOpenAICompat(apiKey, model, messages, 'https://api.mistral.ai/v1/chat/completions', 'mistral');
    default:        return callOpenAICompat(apiKey, model, messages, 'https://api.openai.com/v1/chat/completions', 'openai');
  }
}

// ═══════════════════════════════════════════════════════════
//  PROVIDER ADAPTERS — Streaming (AI_STREAM_REQUEST)
// ═══════════════════════════════════════════════════════════

async function handleStreamRequest(payload, tabId) {
  const settings = await getSettings();
  const { provider, apiKey, model } = resolveConfig(settings);

  if (!apiKey) {
    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_ERROR',
      error: 'No API key set. Open the ⚙️ Settings panel to add your key.',
    });
    return;
  }

  const messages = buildMessages(payload.mode, payload.context, payload.question);

  try {
    switch (provider) {
      case 'gemini':  await streamGemini(apiKey, model, messages, tabId); break;
      case 'claude':  await streamClaude(apiKey, model, messages, tabId); break;
      case 'grok':    await streamGrok(apiKey, model, messages, tabId); break;
      case 'mistral': await streamOpenAICompat(apiKey, model, messages, tabId, 'https://api.mistral.ai/v1/chat/completions', 'mistral'); break;
      default:        await streamOpenAICompat(apiKey, model, messages, tabId, 'https://api.openai.com/v1/chat/completions', 'openai'); break;
    }
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_ERROR',
      error: err.message || 'Stream connection failed',
    });
  }
}

// ── Resolve provider config ───────────────────────────────
function resolveConfig(settings) {
  const provider = settings.provider || 'gemini';
  const apiKey   = settings.apiKey   || '';
  const model    = settings.model    || 'gemini-2.5-flash';
  return { provider, apiKey, model };
}

// ── xAI Grok — Native /v1/responses API ──────────────────
// Mirrors: xai.responses(model) from @ai-sdk/xai SDK
// POST https://api.x.ai/v1/responses
// Body: { model, input, instructions }

function buildGrokBody(model, messages, stream = false) {
  const systemMsg = messages.find(m => m.role === 'system');
  const others = messages.filter(m => m.role !== 'system');

  // Build input array for multi-turn or simple string for single turn
  const input = others.length === 1
    ? others[0].content
    : others.map(m => ({ role: m.role, content: m.content }));

  return {
    model,
    input,
    ...(systemMsg && { instructions: systemMsg.content }),
    ...(stream && { stream: true }),
  };
}

async function callGrok(apiKey, model, messages) {
  const body = buildGrokBody(model, messages, false);
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'grok', model));
  }
  const data = await res.json();
  const text = data.output?.[0]?.content?.[0]?.text || data.output_text || '';
  return { result: text };
}

async function streamGrok(apiKey, model, messages, tabId) {
  const body = buildGrokBody(model, messages, true);
  const res = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'grok', model));
  }

  await pumpSSE(res, tabId, (line) => {
    const data = JSON.parse(line);
    if (data.type === 'response.output_text.delta') {
      return { chunk: data.delta || '' };
    }
    if (data.type === 'response.output_text.done' || data.type === 'response.done') {
      return { done: true };
    }
    return null;
  });
}

// OpenAI-compatible streaming (OpenAI, Grok, Mistral)
async function streamOpenAICompat(apiKey, model, messages, tabId, endpoint, providerName = 'openai') {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, stream: true, max_tokens: 2048 }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, providerName, model));
  }

  await pumpSSE(res, tabId, (line) => {
    if (line === '[DONE]') return { done: true };
    const data = JSON.parse(line);
    const chunk = data.choices?.[0]?.delta?.content || '';
    if (data.choices?.[0]?.finish_reason) return { done: true };
    return chunk ? { chunk } : null;
  });
}

// OpenAI-compatible non-streaming
async function callOpenAICompat(apiKey, model, messages, endpoint, providerName = 'openai') {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, providerName, model));
  }
  const data = await res.json();
  return { result: data.choices?.[0]?.message?.content || '' };
}

// ── Google Gemini ────────────────────────────────────────
// Mirrors the REST API that @google/genai SDK uses internally.
// SDK call: ai.models.generateContent({ model, contents })
// REST equivalent: POST /v1beta/models/{model}:generateContent?key={apiKey}

function buildGeminiBody(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const others = messages.filter(m => m.role !== 'system');

  // Inject system prompt into the first user turn (most compatible approach)
  const contents = others.map((m, i) => {
    let text = m.content;
    if (i === 0 && systemMsg) {
      text = `${systemMsg.content}\n\n${text}`;
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    };
  });

  return {
    contents,
    generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
  };
}

async function streamGemini(apiKey, model, messages, tabId) {
  const body = buildGeminiBody(messages);
  // Same base URL as @google/genai SDK
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'gemini'));
  }

  await pumpSSE(res, tabId, (line) => {
    const data = JSON.parse(line);
    const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason;
    const done = finishReason && finishReason !== 'FINISH_REASON_UNSPECIFIED';
    if (done && !chunk) return { done: true };
    return chunk ? { chunk, ...(done && { done: true }) } : null;
  });
}

async function callGemini(apiKey, model, messages) {
  const body = buildGeminiBody(messages);
  // Same base URL as @google/genai SDK
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'gemini'));
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { result: text };
}

// ── Anthropic Claude streaming ────────────────────────────
async function streamClaude(apiKey, model, messages, tabId) {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs  = messages.filter(m => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      stream: true,
      ...(systemMsg && { system: systemMsg.content }),
      messages: userMsgs,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'claude'));
  }

  await pumpSSE(res, tabId, (line) => {
    const data = JSON.parse(line);
    if (data.type === 'content_block_delta') {
      return { chunk: data.delta?.text || '' };
    }
    if (data.type === 'message_stop') return { done: true };
    return null;
  });
}

// Claude non-streaming
async function callClaude(apiKey, model, messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const userMsgs  = messages.filter(m => m.role !== 'system');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      ...(systemMsg && { system: systemMsg.content }),
      messages: userMsgs,
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(parseApiError(res.status, errData.error?.message, 'claude'));
  }
  const data = await res.json();
  return { result: data.content?.[0]?.text || '' };
}

// ── Generic SSE pump ──────────────────────────────────────
async function pumpSSE(res, tabId, parseLine) {
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finished = false;

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;

      try {
        const result = parseLine(data);
        if (!result) continue;
        chrome.tabs.sendMessage(tabId, { type: 'STREAM_CHUNK', data: result });
        if (result.done) { finished = true; break; }
      } catch { /* ignore parse errors */ }
    }
  }

  if (!finished) {
    chrome.tabs.sendMessage(tabId, { type: 'STREAM_CHUNK', data: { done: true } });
  }
}
