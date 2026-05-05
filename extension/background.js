/**
 * AI Web Copilot – Background Service Worker
 * BYOK (Bring Your Own Key) – calls AI providers directly.
 * Supports: OpenAI (ChatGPT), Google Gemini, xAI (Grok), Anthropic (Claude), Mistral
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
    case 'grok':    return callOpenAICompat(apiKey, model, messages, 'https://api.x.ai/v1/chat/completions');
    case 'mistral': return callOpenAICompat(apiKey, model, messages, 'https://api.mistral.ai/v1/chat/completions');
    default:        return callOpenAICompat(apiKey, model, messages, 'https://api.openai.com/v1/chat/completions');
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
      case 'grok':    await streamOpenAICompat(apiKey, model, messages, tabId, 'https://api.x.ai/v1/chat/completions'); break;
      case 'mistral': await streamOpenAICompat(apiKey, model, messages, tabId, 'https://api.mistral.ai/v1/chat/completions'); break;
      default:        await streamOpenAICompat(apiKey, model, messages, tabId, 'https://api.openai.com/v1/chat/completions'); break;
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
  const provider = settings.provider || 'openai';
  const apiKey   = settings.apiKey   || '';
  const defaultModels = {
    openai:  'gpt-4o-mini',
    gemini:  'gemini-1.5-flash',
    claude:  'claude-3-haiku-20240307',
    grok:    'grok-3-mini',
    mistral: 'mistral-small-latest',
  };
  const model = settings.model || defaultModels[provider] || 'gpt-4o-mini';
  return { provider, apiKey, model };
}

// ── OpenAI-compatible streaming (OpenAI, Grok, Mistral) ───
async function streamOpenAICompat(apiKey, model, messages, tabId, endpoint) {
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
    throw new Error(errData.error?.message || `API error: ${res.status}`);
  }

  await pumpSSE(res, tabId, (line) => {
    if (line === '[DONE]') return { done: true };
    const data = JSON.parse(line);
    const chunk = data.choices?.[0]?.delta?.content || '';
    if (data.choices?.[0]?.finish_reason) return { done: true };
    return chunk ? { chunk } : null;
  });
}

// OpenAI non-streaming
async function callOpenAICompat(apiKey, model, messages, endpoint) {
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
    throw new Error(errData.error?.message || `API error: ${res.status}`);
  }
  const data = await res.json();
  return { result: data.choices?.[0]?.message?.content || '' };
}

// ── Google Gemini streaming ───────────────────────────────
async function streamGemini(apiKey, model, messages, tabId) {
  const contents = toGeminiContents(messages);
  const systemInstruction = messages.find(m => m.role === 'system');

  const body = {
    contents,
    ...(systemInstruction && { system_instruction: { parts: [{ text: systemInstruction.content }] } }),
    generationConfig: { maxOutputTokens: 2048 },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API error: ${res.status}`);
  }

  await pumpSSE(res, tabId, (line) => {
    const data = JSON.parse(line);
    const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const done = data.candidates?.[0]?.finishReason === 'STOP';
    if (done && !chunk) return { done: true };
    return chunk ? { chunk, ...(done && { done: true }) } : null;
  });
}

// Gemini non-streaming
async function callGemini(apiKey, model, messages) {
  const contents = toGeminiContents(messages);
  const systemInstruction = messages.find(m => m.role === 'system');
  const body = {
    contents,
    ...(systemInstruction && { system_instruction: { parts: [{ text: systemInstruction.content }] } }),
    generationConfig: { maxOutputTokens: 2048 },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gemini API error: ${res.status}`);
  }
  const data = await res.json();
  return { result: data.candidates?.[0]?.content?.parts?.[0]?.text || '' };
}

function toGeminiContents(messages) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
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
    throw new Error(errData.error?.message || `Claude API error: ${res.status}`);
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
    throw new Error(errData.error?.message || `Claude API error: ${res.status}`);
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
