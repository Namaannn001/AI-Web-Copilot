# ✦ AI Web Copilot

> Your AI assistant on every website — powered by **Google Gemini**. Bring your own API key, zero servers, zero subscriptions.

---

## 🚀 What It Does

AI Web Copilot is a Chrome Extension that adds a floating AI assistant to any webpage. Select text on any site and instantly:

- 🧠 **Explain** — Get a clear, simple explanation of any content
- 📋 **Summarize** — Condense long articles into key points
- 🔍 **Fact-Check** — Detect potential misinformation or fake news
- 📝 **Convert to Notes** — Transform content into clean structured notes
- 💬 **Ask Anything** — Open-ended chat about anything on the page

---

## 🔑 Setup (Bring Your Own Key)

This extension connects **directly** to Google's Gemini API — no backend server, no middleman.

### Step 1 — Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **Create API Key**
4. Copy the key (starts with `AIza...`)

### Step 2 — Install the Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this project

### Step 3 — Add Your API Key
1. Click the extension icon in the Chrome toolbar
2. Click **⚙️ Settings** (or right-click the icon → Options)
3. Paste your Gemini API key
4. Select your preferred model
5. Click **Test Connection** to verify
6. Click **Save Settings**

---

## 🤖 Available Models

| Model | Type | Best For |
|---|---|---|
| **Gemini 3.1 Pro (Preview)** | Preview | Complex reasoning, agentic workflows |
| **Gemini 3 Flash (Preview)** | Preview | Speed, cost-efficiency |
| **Gemini 3.1 Flash-Lite (Preview)** | Preview | Low latency, high-volume tasks |
| **Gemini 2.5 Pro (Stable)** | Stable | Reliable, high-capability tasks |
| **Gemini 2.5 Flash (Stable)** | Stable | Best price-performance balance ✅ Recommended |

> **Tip:** Start with **Gemini 2.5 Flash** — it's fast, free-tier compatible, and handles most tasks excellently.

---

## 🛡️ Security & Privacy

| Feature | Details |
|---|---|
| **Local-First Storage** | Your API key is stored in Chrome's isolated `chrome.storage.local` — no website can read it |
| **No Backend Server** | API calls go directly from your browser to Google's servers |
| **Shadow DOM UI** | The assistant panel is isolated from page scripts |
| **Secure Options Page** | Settings are managed via Chrome's native extension Options page |
| **No Telemetry** | Zero analytics, zero tracking, zero data collection |

---

## ⌨️ Keyboard Shortcut

Press `Ctrl+Shift+Y` (or `MacCtrl+Shift+Y` on Mac) to toggle the assistant on any page.

---

## 📁 Project Structure

```
extension/
├── manifest.json       # Extension config (MV3)
├── background.js       # Service worker — Gemini API adapter
├── content.js          # UI injected into web pages
├── options.html        # Settings page
├── options.js          # Settings page logic
└── icons/              # Extension icons
```

---

## 🧑‍💻 Development

No build step required. Just:

1. Edit any file in `extension/`
2. Go to `chrome://extensions/`
3. Click the **↺ Reload** button on the extension card
4. Refresh the tab you're testing on

---

## 📄 License

MIT — use it, fork it, build on it.
