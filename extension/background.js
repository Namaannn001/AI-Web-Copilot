/**
 * AI Web Copilot – Background Service Worker
 * Handles context menus, keyboard shortcuts, and messaging.
 */

// Import your hidden configuration file
importScripts('config.js');

const API_BASE = 'http://localhost:3002/api';

// ── Context Menu Setup ────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  const menuItems = [
    { id: 'copilot-explain', title: '🧠 Explain this' },
    { id: 'copilot-summarize', title: '📋 Summarize' },
    { id: 'copilot-fakenews', title: '🔍 Check Fake News' },
    { id: 'copilot-notes', title: '📝 Convert to Notes' },
  ];

  // Parent menu
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
    'copilot-explain': 'explain',
    'copilot-summarize': 'summarize',
    'copilot-fakenews': 'fakenews',
    'copilot-notes': 'notes',
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
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_ASSISTANT',
    });
  }
});

// ── Extension Icon Click Handler ──────────────────────────
chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'TOGGLE_ASSISTANT',
    });
  }
});

// ── Message Handler (Proxy API calls for content scripts) ─
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'AI_REQUEST') {
    handleAIRequest(message.payload)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // async response
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

// ── API Communication ─────────────────────────────────────
async function handleAIRequest(payload) {
  try {
    const res = await fetch(`${API_BASE}/ai`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EXT_CONFIG.SECRET_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    throw new Error(err.message || 'Failed to connect to AI server');
  }
}

async function handleStreamRequest(payload, tabId) {
  try {
    const res = await fetch(`${API_BASE}/ai/stream`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EXT_CONFIG.SECRET_KEY}`
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      chrome.tabs.sendMessage(tabId, {
        type: 'STREAM_ERROR',
        error: errData.error || `Server error: ${res.status}`,
      });
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            chrome.tabs.sendMessage(tabId, {
              type: 'STREAM_CHUNK',
              data,
            });
          } catch { /* ignore parse errors */ }
        }
      }
    }

    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_CHUNK',
      data: { done: true },
    });
  } catch (err) {
    chrome.tabs.sendMessage(tabId, {
      type: 'STREAM_ERROR',
      error: err.message || 'Stream connection failed',
    });
  }
}
