/**
 * AI Web Copilot – Content Script
 * Full floating assistant UI with Shadow DOM isolation.
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__aiWebCopilotLoaded) return;
  window.__aiWebCopilotLoaded = true;

  const CONTAINER_ID = 'ai-web-copilot-root';
  const MAX_CONTENT_LENGTH = 3000;
  const STORAGE_KEY_HISTORY  = 'copilot_history';
  const STORAGE_KEY_POSITION = 'copilot_position';
  const STORAGE_KEY_SETTINGS = 'copilot_settings';

  // ════════════════════════════════════════════════════════
  //  STATE
  // ════════════════════════════════════════════════════════
  let isOpen = false;
  let isMinimized = false;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let panelPosition = { x: -1, y: -1 };
  let currentMode = 'general';
  let isLoading = false;
  let streamContent = '';
  let isStopped = false;
  let lastContext = '';
  let lastQuestion = '';

  // ════════════════════════════════════════════════════════
  //  SHADOW DOM SETUP
  // ════════════════════════════════════════════════════════
  const hostEl = document.createElement('div');
  hostEl.id = CONTAINER_ID;
  hostEl.style.cssText = 'all:initial; position:fixed; z-index:2147483647; top:0; left:0; width:0; height:0; pointer-events:none;';
  document.documentElement.appendChild(hostEl);

  const shadow = hostEl.attachShadow({ mode: 'closed' });

  // ════════════════════════════════════════════════════════
  //  STYLES (inside Shadow DOM)
  // ════════════════════════════════════════════════════════
  const styleEl = document.createElement('style');
  styleEl.textContent = getStyles();
  shadow.appendChild(styleEl);

  // ════════════════════════════════════════════════════════
  //  CREATE UI ELEMENTS
  // ════════════════════════════════════════════════════════

  // ── Floating "Ask About This Page" Button ───────────────
  const fab = document.createElement('button');
  fab.className = 'copilot-fab';
  fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`;
  fab.title = 'Ask AI about this page (Ctrl+Shift+Y)';
  fab.addEventListener('click', () => toggleAssistant());
  shadow.appendChild(fab);

  // ── Selection Tooltip ───────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.className = 'copilot-tooltip';
  tooltip.innerHTML = `<button class="tooltip-btn" data-mode="explain">🧠 Explain</button><button class="tooltip-btn" data-mode="summarize">📋 Summarize</button><button class="tooltip-btn" data-mode="notes">📝 Notes</button>`;
  tooltip.style.display = 'none';
  shadow.appendChild(tooltip);

  tooltip.querySelectorAll('.tooltip-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mode = btn.dataset.mode;
      const text = window.getSelection()?.toString()?.trim();
      if (text) {
        hideTooltip();
        openAssistant();
        sendRequest(mode, text);
      }
    });
  });

  // ── Main Assistant Panel ────────────────────────────────
  const panel = document.createElement('div');
  panel.className = 'copilot-panel';
  panel.style.display = 'none';
  panel.innerHTML = buildPanelHTML();
  shadow.appendChild(panel);

  // ── Get Panel Elements ──────────────────────────────────
  const els = {
    header:          panel.querySelector('.panel-header'),
    title:           panel.querySelector('.panel-title'),
    minimizeBtn:     panel.querySelector('.btn-minimize'),
    closeBtn:        panel.querySelector('.btn-close'),
    historyBtn:      panel.querySelector('.btn-history'),
    settingsBtn:     panel.querySelector('.btn-settings'),
    body:            panel.querySelector('.panel-body'),
    modeBar:         panel.querySelector('.mode-bar'),
    responseArea:    panel.querySelector('.response-area'),
    responseContent: panel.querySelector('.response-content'),
    inputArea:       panel.querySelector('.input-area'),
    inputField:      panel.querySelector('.input-field'),
    sendBtn:         panel.querySelector('.btn-send'),
    loader:          panel.querySelector('.loader'),
    statusBar:       panel.querySelector('.status-bar'),
    statusText:      panel.querySelector('.status-text'),
    copyBtn:         panel.querySelector('.btn-copy'),
    exportPdfBtn:    panel.querySelector('.btn-export-pdf'),
    stopBtn:         panel.querySelector('.btn-stop'),
    historyPanel:    panel.querySelector('.history-panel'),
    historyList:     panel.querySelector('.history-list'),
    historyBack:     panel.querySelector('.btn-history-back'),
  };

  // ════════════════════════════════════════════════════════
  //  EVENT LISTENERS
  // ════════════════════════════════════════════════════════

  // Header drag
  els.header.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);

  // Buttons
  els.minimizeBtn.addEventListener('click', () => minimizePanel());
  els.closeBtn.addEventListener('click', () => closeAssistant());
  els.sendBtn.addEventListener('click', () => onSend());
  els.historyBtn.addEventListener('click', () => toggleHistory());
  els.historyBack.addEventListener('click', () => toggleHistory());
  els.settingsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
    closeAssistant();
  });
  els.copyBtn.addEventListener('click', () => copyResponse());
  els.exportPdfBtn.addEventListener('click', () => exportPDF());
  els.stopBtn.addEventListener('click', () => stopStream());

  // Input: Enter to send, Esc to close
  els.inputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if (e.key === 'Escape') {
      closeAssistant();
    }
  });

  // Mode buttons
  els.modeBar.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMode(btn.dataset.mode);
    });
  });

  // Text selection for tooltip
  document.addEventListener('mouseup', (e) => {
    // Don't show tooltip if interacting with our UI
    if (hostEl.contains(e.target)) return;

    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString()?.trim();
      if (text && text.length > 3) {
        showTooltip(sel);
      } else {
        hideTooltip();
      }
    }, 50);
  });

  document.addEventListener('mousedown', (e) => {
    if (!hostEl.contains(e.target)) {
      hideTooltip();
    }
  });

  // ── Chrome Message Listener ─────────────────────────────
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case 'TOGGLE_ASSISTANT':
        toggleAssistant();
        break;

      case 'CONTEXT_MENU_ACTION':
        openAssistant();
        sendRequest(message.mode, message.selectedText);
        break;

      case 'STREAM_CHUNK':
        handleStreamChunk(message.data);
        break;

      case 'STREAM_ERROR':
        handleStreamError(message.error);
        break;
    }
    sendResponse?.({ received: true });
  });

  // ── Load saved position ─────────────────────────────────
  loadPosition();

  // ════════════════════════════════════════════════════════
  //  CORE FUNCTIONS
  // ════════════════════════════════════════════════════════

  function toggleAssistant() {
    if (isMinimized) {
      restorePanel();
    } else if (isOpen) {
      closeAssistant();
    } else {
      openAssistant();
    }
  }

  function openAssistant() {
    isOpen = true;
    isMinimized = false;
    panel.style.display = 'flex';
    panel.classList.remove('minimized');
    els.body.style.display = '';
    fab.classList.add('active');

    if (panelPosition.x < 0) {
      panelPosition.x = window.innerWidth - 420;
      panelPosition.y = 80;
    }
    applyPosition();
    els.inputField.focus();

    // Auto-load page context hint
    const selectedText = window.getSelection()?.toString()?.trim();
    if (selectedText) {
      els.statusText.textContent = `Selected: "${selectedText.slice(0, 60)}${selectedText.length > 60 ? '...' : ''}"`;
    } else {
      els.statusText.textContent = 'Ready — select text or ask about this page';
    }
  }

  function closeAssistant() {
    isOpen = false;
    isMinimized = false;
    panel.style.display = 'none';
    fab.classList.remove('active');
    els.historyPanel.style.display = 'none';
  }

  function minimizePanel() {
    isMinimized = true;
    panel.classList.add('minimized');
    els.body.style.display = 'none';
  }

  function restorePanel() {
    isMinimized = false;
    panel.classList.remove('minimized');
    els.body.style.display = '';
    els.inputField.focus();
  }

  // ── Dragging ────────────────────────────────────────────
  function startDrag(e) {
    if (e.target.tagName === 'BUTTON') return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;
    panel.style.transition = 'none';
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    panelPosition.x = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
    panelPosition.y = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.y));
    applyPosition();
  }

  function stopDrag() {
    if (!isDragging) return;
    isDragging = false;
    panel.style.transition = '';
    savePosition();
  }

  function applyPosition() {
    panel.style.left = panelPosition.x + 'px';
    panel.style.top = panelPosition.y + 'px';
  }

  function savePosition() {
    chrome.storage.local.set({ [STORAGE_KEY_POSITION]: panelPosition });
  }

  function loadPosition() {
    chrome.storage.local.get(STORAGE_KEY_POSITION, (data) => {
      if (data[STORAGE_KEY_POSITION]) {
        panelPosition = data[STORAGE_KEY_POSITION];
      }
    });
  }

  // ── Mode Selection ──────────────────────────────────────
  function setMode(mode) {
    currentMode = mode;
    els.modeBar.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  // ── Send Request ────────────────────────────────────────
  function onSend() {
    if (isLoading) return;

    const question = els.inputField.value.trim();
    const selectedText = window.getSelection()?.toString()?.trim();
    let context = selectedText || '';

    // If no selection, grab page content
    if (!context) {
      context = getPageContent();
    }

    if (!question && !context) {
      setStatus('Please enter a question or select some text', 'warn');
      return;
    }

    sendRequest(currentMode, context, question);
  }

  function sendRequest(mode, context, question) {
    if (isLoading) return;

    lastContext = context;
    lastQuestion = question;
    isStopped = false;

    setMode(mode);
    setLoading(true);
    streamContent = '';
    els.responseArea.style.display = 'block';

    const userText = question ? question : `[Action: ${mode}] on selected text`;
    els.responseContent.innerHTML += `<div class="user-bubble"><strong>You:</strong><br>${escapeHTML(userText)}</div><div class="ai-bubble"></div>`;
    els.stopBtn.style.display = 'inline-block';

    if (question) {
      els.inputField.value = '';
    }

    // Use streaming
    chrome.runtime.sendMessage({
      type: 'AI_STREAM_REQUEST',
      payload: {
        mode,
        context: context?.slice(0, MAX_CONTENT_LENGTH),
        question: question || undefined,
      },
      tabId: undefined, // background will use sender.tab.id
    }, (response) => {
      if (chrome.runtime.lastError) {
        handleStreamError('Could not connect to extension. Try reloading the page.');
      } else if (response && response.error) {
        handleStreamError(response.error);
      }
    });
  }

  // ── Stream Handling ─────────────────────────────────────
  function handleStreamChunk(data) {
    if (isStopped) return;

    if (data.error) {
      handleStreamError(data.error);
      return;
    }

    if (data.chunk && !data.done) {
      streamContent += data.chunk;
      renderResponse(streamContent);
    }

    if (data.done) {
      if (data.cached && data.chunk) {
        streamContent = data.chunk;
        renderResponse(streamContent);
      }
      stopStream(true);
      setStatus(`Complete — ${currentMode}`, 'success');
      saveToHistory(currentMode, lastContext, lastQuestion, streamContent);
    }
  }

  function handleStreamError(error) {
    setLoading(false);
    setStatus('Error: ' + error, 'error');
    const isKeyError = /api key|no api key|unauthorized|401/i.test(error);
    const hint = isKeyError
      ? 'Open the <strong>⚙️ Settings</strong> panel and add your API key.'
      : 'Check your API key and provider in <strong>⚙️ Settings</strong>.';
    els.responseContent.innerHTML = `<div class="error-msg">❌ ${escapeHTML(error)}<br><br><small>${hint}</small></div>`;
    els.responseArea.style.display = 'block';
  }

  // ── Response Rendering (Markdown-like) ──────────────────
  function renderResponse(text) {
    const aiBubbles = els.responseContent.querySelectorAll('.ai-bubble');
    const aiBubble = aiBubbles[aiBubbles.length - 1];
    if (aiBubble) {
      aiBubble.innerHTML = formatMarkdown(text);
      els.responseContent.scrollTop = els.responseContent.scrollHeight;
    }
  }

  function formatMarkdown(text) {
    if (!text) return '';

    let html = escapeHTML(text);

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Code blocks
    html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Bullet points
    html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
    // Collapse consecutive </ul><ul>
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs
    html = html.replace(/\n\n/g, '</p><p>');
    html = '<p>' + html + '</p>';

    // Disclaimer styling
    html = html.replace(/(⚠️[^<]+)/g, '<span class="disclaimer">$1</span>');

    return html;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Page Content Extraction ─────────────────────────────
  function getPageContent() {
    // Try to get main article content first
    const articleSelectors = ['article', 'main', '[role="main"]', '.post-content', '.article-content', '.entry-content'];
    for (const sel of articleSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText?.trim().length > 100) {
        return el.innerText.trim().slice(0, MAX_CONTENT_LENGTH);
      }
    }

    // Fallback to body content
    const bodyText = document.body.innerText || '';
    return bodyText.trim().slice(0, MAX_CONTENT_LENGTH);
  }

  // ── Tooltip ─────────────────────────────────────────────
  function showTooltip(selection) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    tooltip.style.display = 'flex';
    tooltip.style.left = Math.max(10, rect.left + rect.width / 2 - 120) + 'px';
    tooltip.style.top = Math.max(10, rect.top - 45 + window.scrollY) + 'px';
    // Adjust for viewport scroll since we're in fixed positioning via shadow DOM
    tooltip.style.position = 'fixed';
    tooltip.style.top = Math.max(10, rect.top - 45) + 'px';
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  // ── UI Helpers ──────────────────────────────────────────
  function setLoading(loading) {
    isLoading = loading;
    els.loader.style.display = loading ? 'flex' : 'none';
    els.sendBtn.disabled = loading;
    els.inputField.disabled = loading;
    if (loading) {
      setStatus('Thinking...', 'loading');
    }
  }

  function setStatus(text, type = 'info') {
    els.statusText.textContent = text;
    els.statusBar.className = 'status-bar status-' + type;
  }

  function copyResponse() {
    const text = els.responseContent.innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const original = els.copyBtn.textContent;
      els.copyBtn.textContent = '✓ Copied!';
      setTimeout(() => (els.copyBtn.textContent = original), 1500);
    });
  }



  function stopStream(autoDone = false) {
    isStopped = true;
    if (!autoDone) {
      setStatus('Paused/Stopped', 'warn');
      const aiBubble = els.responseContent.querySelector('.ai-bubble');
      if (aiBubble) {
        aiBubble.innerHTML += '<br><br><em>(Generation stopped)</em>';
      }
    }
    setLoading(false);
    els.stopBtn.style.display = 'none';
  }

  function exportPDF() {
    const chatHtml = els.responseContent.innerHTML;
    if (!chatHtml) return;
    
    // Create an invisible iframe to handle the PDF printing without leaving the page
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    iframe.contentWindow.document.write(`
      <html>
        <head>
          <title>AI_Web_Copilot_Chat.pdf</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
            h1, h2, h3 { color: #111; }
            pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word; }
            code { background: #eee; padding: 2px 5px; border-radius: 3px; font-family: monospace; }
            .user-bubble { background: #f0f7ff; padding: 15px; border-radius: 8px; margin-top: 25px; margin-bottom: 15px; border-left: 4px solid #0066cc; }
            .ai-bubble { margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <h2>AI Web Copilot Chat Thread</h2>
          ${chatHtml}
        </body>
      </html>
    `);
    iframe.contentWindow.document.close();

    // Trigger the print directly from the trusted content script, bypassing CSP blocks
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 400);

    // Clean up the invisible iframe after printing process finishes
    setTimeout(() => {
      if (document.body.contains(iframe)) document.body.removeChild(iframe);
    }, 10000);
  }

  // ── History ─────────────────────────────────────────────
  function saveToHistory(mode, context, question, response) {
    chrome.storage.local.get(STORAGE_KEY_HISTORY, (data) => {
      const history = data[STORAGE_KEY_HISTORY] || [];
      history.unshift({
        mode,
        question: question || `[${mode}]`,
        response: response?.slice(0, 500),
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
      });

      // Keep only last 50
      chrome.storage.local.set({
        [STORAGE_KEY_HISTORY]: history.slice(0, 50),
      });
    });
  }

  function toggleHistory() {
    const showing = els.historyPanel.style.display !== 'none';
    if (showing) {
      els.historyPanel.style.display = 'none';
    } else {
      loadHistory();
      els.historyPanel.style.display = 'flex';
    }
  }

  function loadHistory() {
    chrome.storage.local.get(STORAGE_KEY_HISTORY, (data) => {
      const history = data[STORAGE_KEY_HISTORY] || [];
      if (history.length === 0) {
        els.historyList.innerHTML = '<div class="history-empty">No history yet</div>';
        return;
      }

      els.historyList.innerHTML = history
        .map(
          (item, i) => `
        <div class="history-item" data-index="${i}">
          <div class="history-meta">
            <span class="history-mode">${getModeEmoji(item.mode)} ${item.mode}</span>
            <span class="history-time">${formatTime(item.timestamp)}</span>
          </div>
          <div class="history-question">${escapeHTML(item.question?.slice(0, 80))}</div>
          <div class="history-preview">${escapeHTML(item.response?.slice(0, 120))}...</div>
        </div>
      `
        )
        .join('');

      els.historyList.querySelectorAll('.history-item').forEach((el) => {
        el.addEventListener('click', () => {
          const item = history[parseInt(el.dataset.index)];
          els.responseArea.style.display = 'block';
          const userText = item.question ? item.question : `[Action: ${item.mode}] on selected text`;
          els.responseContent.innerHTML = `<div class="user-bubble"><strong>You:</strong><br>${escapeHTML(userText)}</div><div class="ai-bubble"></div>`;
          renderResponse(item.response);
          streamContent = item.response;
          lastQuestion = item.question;
          setStatus(`Viewed history — ${item.mode}`, 'success');
          els.historyPanel.style.display = 'none';
        });
      });
    });
  }

  function getModeEmoji(mode) {
    const map = { explain: '🧠', summarize: '📋', fakenews: '🔍', notes: '📝', general: '✦' };
    return map[mode] || '✦';
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString();
  }

  // ════════════════════════════════════════════════════════
  //  HTML BUILDERS
  // ════════════════════════════════════════════════════════

  function buildPanelHTML() {
    return `
      <div class="panel-header">
        <div class="panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          <span>AI Web Copilot</span>
        </div>
        <div class="panel-controls">
          <button class="panel-btn btn-history" title="History">🕐</button>
          <button class="panel-btn btn-settings" title="Settings">⚙️</button>
          <button class="panel-btn btn-minimize" title="Minimize">─</button>
          <button class="panel-btn btn-close" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="panel-body">
        <div class="mode-bar">
          <button class="mode-btn active" data-mode="general">✦ Ask</button>
          <button class="mode-btn" data-mode="explain">🧠 Explain</button>
          <button class="mode-btn" data-mode="summarize">📋 Summary</button>
          <button class="mode-btn" data-mode="fakenews">🔍 Verify</button>
          <button class="mode-btn" data-mode="notes">📝 Notes</button>
        </div>
        <div class="response-area" style="display:none;">
          <div class="response-content"></div>
          <div class="response-actions">
            <button class="action-btn btn-copy">📋 Copy</button>
            <button class="action-btn btn-export-pdf">📄 Export PDF</button>
            <button class="action-btn btn-stop" style="display:none; margin-left:auto; color:#f87171; border-color:rgba(248,113,113,0.3);">⏹ Stop</button>
          </div>
        </div>
        <div class="loader" style="display:none;">
          <div class="loader-dots">
            <span></span><span></span><span></span>
          </div>
          <span class="loader-text">Analyzing...</span>
        </div>
        <div class="input-area">
          <textarea class="input-field" placeholder="Ask anything about this page..." rows="2"></textarea>
          <button class="btn-send" title="Send (Enter)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div class="status-bar">
          <span class="status-text">Ready — select text or ask about this page</span>
        </div>
        <div class="history-panel" style="display:none;">
          <div class="history-header">
            <button class="panel-btn btn-history-back">← Back</button>
            <span>History</span>
          </div>
          <div class="history-list"></div>
        </div>
      </div>
    `;
  }

  // ════════════════════════════════════════════════════════
  //  STYLES
  // ════════════════════════════════════════════════════════
  function getStyles() {
    return `
      *, *::before, *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      /* ── Floating Action Button ─────────────────── */
      .copilot-fab {
        all: initial;
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 52px;
        height: 52px;
        border-radius: 16px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        box-shadow: 0 4px 24px rgba(99,102,241,0.4), 0 0 0 0 rgba(139,92,246,0.4);
        transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
        z-index: 2147483647;
        animation: fabPulse 3s ease-in-out infinite;
      }

      .copilot-fab:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 32px rgba(99,102,241,0.5), 0 0 0 4px rgba(139,92,246,0.2);
      }

      .copilot-fab.active {
        background: linear-gradient(135deg, #4f46e5, #7c3aed);
        animation: none;
      }

      .copilot-fab svg {
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
      }

      @keyframes fabPulse {
        0%, 100% { box-shadow: 0 4px 24px rgba(99,102,241,0.4), 0 0 0 0 rgba(139,92,246,0.4); }
        50% { box-shadow: 0 4px 24px rgba(99,102,241,0.4), 0 0 0 8px rgba(139,92,246,0); }
      }

      /* ── Tooltip ────────────────────────────────── */
      .copilot-tooltip {
        position: fixed;
        display: flex;
        gap: 4px;
        padding: 4px;
        background: #1e1b2e;
        border: 1px solid rgba(139,92,246,0.3);
        border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 2147483646;
        pointer-events: auto;
        animation: tooltipIn 0.15s ease-out;
      }

      @keyframes tooltipIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .tooltip-btn {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        padding: 6px 10px;
        background: transparent;
        color: #c4b5fd;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.15s;
        pointer-events: auto;
      }

      .tooltip-btn:hover {
        background: rgba(139,92,246,0.2);
        color: white;
      }

      /* ── Main Panel ─────────────────────────────── */
      .copilot-panel {
        position: fixed;
        width: 380px;
        max-height: 580px;
        display: flex;
        flex-direction: column;
        background: #0f0d1a;
        border: 1px solid rgba(139,92,246,0.2);
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 1px rgba(139,92,246,0.4);
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
        color: #e2e0f0;
        pointer-events: auto;
        animation: panelIn 0.25s cubic-bezier(0.16,1,0.3,1);
        transition: all 0.2s ease;
        z-index: 2147483647;
      }

      .copilot-panel.minimized {
        max-height: 48px;
        border-radius: 12px;
      }

      @keyframes panelIn {
        from { opacity: 0; transform: scale(0.95) translateY(10px); }
        to { opacity: 1; transform: scale(1) translateY(0); }
      }

      /* ── Panel Header ───────────────────────────── */
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1));
        border-bottom: 1px solid rgba(139,92,246,0.15);
        cursor: grab;
        user-select: none;
        -webkit-user-select: none;
      }

      .panel-header:active { cursor: grabbing; }

      .panel-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
        color: #c4b5fd;
      }

      .panel-title svg { color: #a78bfa; }
      .panel-title span { background: linear-gradient(90deg, #a78bfa, #c4b5fd); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

      .panel-controls { display: flex; gap: 4px; }

      .panel-btn {
        all: initial;
        font-family: inherit;
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        color: #9ca3af;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
        pointer-events: auto;
      }

      .panel-btn:hover {
        background: rgba(255,255,255,0.1);
        color: white;
      }

      /* ── Panel Body ─────────────────────────────── */
      .panel-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        position: relative;
      }

      /* ── Mode Bar ───────────────────────────────── */
      .mode-bar {
        display: flex;
        gap: 4px;
        padding: 8px 12px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        overflow-x: auto;
        scrollbar-width: none;
      }

      .mode-bar::-webkit-scrollbar { display: none; }

      .mode-btn {
        all: initial;
        font-family: inherit;
        font-size: 11px;
        padding: 5px 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        color: #9ca3af;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
        pointer-events: auto;
      }

      .mode-btn:hover {
        background: rgba(139,92,246,0.15);
        color: #c4b5fd;
        border-color: rgba(139,92,246,0.3);
      }

      .mode-btn.active {
        background: linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.2));
        border-color: rgba(139,92,246,0.4);
        color: #c4b5fd;
        font-weight: 500;
      }

      /* ── Response Area ──────────────────────────── */
      .response-area {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .response-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        font-size: 13px;
        line-height: 1.7;
        max-height: 320px;
        color: #d1d5db;
        scroll-behavior: smooth;
      }

      .response-content h2 { font-size: 16px; color: #c4b5fd; margin: 16px 0 8px 0; font-weight: 600; }
      .response-content h3 { font-size: 14px; color: #a78bfa; margin: 12px 0 6px 0; font-weight: 600; }
      .response-content h4 { font-size: 13px; color: #8b5cf6; margin: 10px 0 4px 0; font-weight: 600; }
      .response-content p { margin-bottom: 8px; }
      .response-content ul { margin: 8px 0; padding-left: 20px; }
      .response-content li { margin-bottom: 4px; }
      .response-content li::marker { color: #8b5cf6; }
      .response-content strong { color: #e2d9f3; font-weight: 600; }
      .response-content em { color: #c4b5fd; font-style: italic; }
      .response-content code { background: rgba(139,92,246,0.15); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-family: 'Fira Code', monospace; font-size: 12px; }
      .response-content pre { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 12px; overflow-x: auto; margin: 8px 0; }
      .response-content pre code { background: none; padding: 0; }
      .response-content .disclaimer { display: block; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); border-radius: 8px; padding: 8px 12px; margin: 10px 0; color: #fbbf24; font-size: 12px; }
      .response-content .error-msg { color: #f87171; background: rgba(248,113,113,0.1); border: 1px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 12px; }

      .response-content::-webkit-scrollbar { width: 5px; }
      .response-content::-webkit-scrollbar-track { background: transparent; }
      .response-content::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.3); border-radius: 4px; }

      .user-bubble {
        background: rgba(139,92,246,0.15);
        border-left: 3px solid #a78bfa;
        padding: 10px 14px;
        border-radius: 8px;
        margin-bottom: 16px;
        color: #e2d9f3;
        line-height: 1.5;
      }
      .ai-bubble {
        animation: fadeIn 0.3s ease;
      }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

      .response-actions {
        display: flex;
        gap: 6px;
        padding: 8px 16px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .action-btn {
        all: initial;
        font-family: inherit;
        font-size: 11px;
        padding: 5px 10px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 6px;
        color: #9ca3af;
        cursor: pointer;
        transition: all 0.15s;
        pointer-events: auto;
      }

      .action-btn:hover {
        background: rgba(139,92,246,0.15);
        color: #c4b5fd;
      }

      /* ── Loader ─────────────────────────────────── */
      .loader {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 24px;
      }

      .loader-dots {
        display: flex;
        gap: 4px;
      }

      .loader-dots span {
        width: 8px;
        height: 8px;
        background: #8b5cf6;
        border-radius: 50%;
        animation: dotPulse 1.4s ease-in-out infinite;
      }

      .loader-dots span:nth-child(2) { animation-delay: 0.2s; }
      .loader-dots span:nth-child(3) { animation-delay: 0.4s; }

      @keyframes dotPulse {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      .loader-text {
        font-size: 12px;
        color: #8b5cf6;
        animation: fadeText 1.5s ease-in-out infinite;
      }

      @keyframes fadeText {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
      }

      /* ── Input Area ─────────────────────────────── */
      .input-area {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }

      .input-field {
        all: initial;
        font-family: inherit;
        flex: 1;
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: 10px 14px;
        color: #e2e0f0;
        font-size: 13px;
        resize: vertical;
        min-height: 40px;
        max-height: 200px;
        outline: none;
        transition: border-color 0.2s;
        line-height: 1.4;
        pointer-events: auto;
      }

      .input-field::placeholder { color: #6b7280; }

      .input-field:focus {
        border-color: rgba(139,92,246,0.5);
        box-shadow: 0 0 0 3px rgba(139,92,246,0.1);
      }

      .btn-send {
        all: initial;
        font-family: inherit;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border: none;
        border-radius: 10px;
        color: white;
        cursor: pointer;
        transition: all 0.2s;
        flex-shrink: 0;
        pointer-events: auto;
      }

      .btn-send:hover { transform: scale(1.05); box-shadow: 0 4px 16px rgba(99,102,241,0.4); }
      .btn-send:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

      /* ── Status Bar ─────────────────────────────── */
      .status-bar {
        padding: 6px 12px;
        font-size: 11px;
        color: #6b7280;
        border-top: 1px solid rgba(255,255,255,0.03);
        text-align: center;
      }

      .status-bar.status-success .status-text { color: #34d399; }
      .status-bar.status-error .status-text { color: #f87171; }
      .status-bar.status-warn .status-text { color: #fbbf24; }
      .status-bar.status-loading .status-text { color: #8b5cf6; }

      /* ── History Panel ──────────────────────────── */
      .history-panel {
        position: absolute;
        inset: 0;
        background: #0f0d1a;
        display: flex;
        flex-direction: column;
        z-index: 10;
        animation: panelIn 0.2s ease;
      }

      .history-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        font-size: 13px;
        font-weight: 600;
        color: #c4b5fd;
      }

      .history-list {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
      }

      .history-item {
        padding: 10px 12px;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 10px;
        margin-bottom: 6px;
        cursor: pointer;
        transition: all 0.15s;
        pointer-events: auto;
      }

      .history-item:hover {
        background: rgba(139,92,246,0.1);
        border-color: rgba(139,92,246,0.2);
      }

      .history-meta {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        margin-bottom: 4px;
      }

      .history-mode { color: #8b5cf6; font-weight: 500; }
      .history-time { color: #6b7280; }
      .history-question { font-size: 12px; color: #c4b5fd; font-weight: 500; margin-bottom: 2px; }
      .history-preview { font-size: 11px; color: #6b7280; }
      .history-empty { text-align: center; color: #6b7280; font-size: 13px; padding: 40px 20px; }
    `;
  }
})();
