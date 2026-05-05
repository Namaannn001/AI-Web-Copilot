#  AI Web Copilot — Smart Web Assistant

A production-ready Chrome Extension that adds an AI assistant layer on top of every website. Summarize pages, explain content, fact-check claims, and convert text to notes — all with a single right-click, keyboard shortcut, or click. 

**Bring Your Own Key (BYOK) Architecture:** Operates entirely locally in your browser. Connects directly to OpenAI, Google Gemini, Anthropic Claude, xAI Grok, or Mistral AI using your own API keys. No backend server required!

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![BYOK](https://img.shields.io/badge/Architecture-BYOK-339933)
![Multi-Model](https://img.shields.io/badge/Models-OpenAI%20%7C%20Gemini%20%7C%20Claude%20%7C%20Grok-8b5cf6)

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🔑 **Bring Your Own Key** | Connect directly to top AI providers. Your key never leaves your browser. |
| 🤖 **Multi-Model Support** | Choose between ChatGPT, Gemini, Claude, Grok, and Mistral. |
| 🧠 **Explain** | Get clear, simple explanations of selected text. |
| 📋 **Summarize** | TL;DR, bullet points, and key insights. |
| 🔍 **Fake News Check** | Credibility analysis with confidence levels. |
| 📝 **Notes** | Convert content into structured study notes. |
| 💬 **Continuous Thread** | View your entire back-and-forth chat history dynamically. |
| 📄 **PDF Export** | Save your full AI conversation locally as a formatted PDF. |
| ⌨️ **Keyboard Shortcut** | `Ctrl+Shift+Y` to immediately toggle the assistant. |
| 🌊 **Streaming Output** | Real-time typing effect for immediate response viewing. |
| 👻 **Shadow DOM** | Extension CSS is isolated — guarantees it works beautifully on any website. |

---

## 📁 Project Structure

```
smart-web-assistant/
├── extension/
│   ├── manifest.json          # Chrome Extension Manifest V3
│   ├── background.js          # Service Worker (Handles API Requests securely)
│   ├── content.js             # UI + Shadow DOM injection
│   ├── options.html           # Secure native settings page for API keys
│   ├── options.js             # Settings logic
│   └── icons/                 # Extension icons
│
└── README.md
```

---

## ⚡ Quick Start

### 1. Install the Chrome Extension

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **"Load unpacked"** and select the `extension/` folder.

### 2. Configure Your AI Provider

1. Pin the extension to your Chrome toolbar.
2. Open any webpage and hit `Ctrl+Shift+Y` (or click the extension icon) to open the copilot.
3. Click the **⚙️ Settings** icon in the header. This will securely open the native Chrome Extension Options page.
4. Select your preferred AI Provider (e.g., Google Gemini, OpenAI).
5. Paste your respective API key.
6. Click **Test Connection** to verify the key, then click **Save Settings**.

### 3. Start Using It

- **Right-click** on selected text → choose an AI action.
- Press **Ctrl+Shift+Y** to open the assistant anytime.
- Click the **floating purple ✦ button** on any page.
- Hit **📄 Export PDF** to instantly download your chat thread.

---

## 🛡️ Privacy & Security Built-in

This extension is built with a strict **Local-First / BYOK Architecture**:

- ✅ **No Intermediary Servers:** Your API requests go directly from your browser to the AI provider (OpenAI/Google/Anthropic/xAI). There is no "man in the middle."
- ✅ **Local Storage Only:** Your API key and chat history are saved exclusively in your browser's local storage (`chrome.storage.local`).
- ✅ **Shadow DOM:** Frontend UI elements cannot be hijacked, restyled, or read by the websites you visit.
- ✅ **Isolated Settings Page:** The API key input is safely sandboxed inside a native Chrome Extension Options page (`chrome-extension://...`). It is completely immune to keystroke loggers or malicious scripts running on regular web pages.

---

## 📝 Permissions Used

| Permission | Reason |
|---|---|
| `contextMenus` | Right-click menu items |
| `activeTab` | Access current tab content intelligently |
| `scripting` | Inject content scripts into DOM |
| `storage` | Save chat history and API keys securely to browser |
| `host_permissions` | Allows background worker to contact AI APIs directly without CORS errors |

---

## 📄 License
MIT License — free for personal and commercial use.
