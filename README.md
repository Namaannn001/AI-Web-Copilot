# ✦ AI Web Copilot — Smart Web Assistant

A production-ready Chrome Extension with a secured Node.js backend that adds an AI assistant layer on top of every website. Summarize pages, explain content, fact-check claims, and convert text to notes — all with a single right-click, keyboard shortcut, or click. Powered by Google Gemini.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=nodedotjs&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini-8b5cf6)

---

## 🚀 Features

| Feature | Description |
|---|---|
| 🧠 **Explain** | Get clear, simple explanations of selected text |
| 📋 **Summarize** | TL;DR, bullet points, and key insights |
| 🔍 **Fake News Check** | Credibility analysis with confidence levels |
| 📝 **Notes** | Convert content into structured study notes |
| 💬 **Continuous Thread** | View your entire back-and-forth chat history dynamically |
| 📄 **PDF Export** | Save your full AI conversation locally as a formatted PDF |
| ⌨️ **Keyboard Shortcut** | `Ctrl+Shift+Y` to immediately toggle the assistant |
| 🌊 **Streaming Output** | Real-time typing effect for immediate response viewing |
| 🛡️ **Production Secured** | Fully authenticated, rate-limited, CORS-locked Node.js backend |
| 👻 **Shadow DOM** | Extension CSS is isolated — guarantees it works beautifully on any website |

---

## 📁 Project Structure

```
smart-web-assistant/
├── backend/
│   ├── server.js              # Express server (Helmet, CORS, Auth, Rate Limiter)
│   ├── package.json
│   ├── .env                   # Secure API keys (Not tracked in Git)
│   ├── .env.example           # Example config for public repos
│   ├── routes/
│   │   └── ai.js              # AI HTTP & SSE stream handlers
│   └── services/
│       ├── openai.js          # Google Gemini generative-ai adapter
│       ├── prompts.js         # Specialized AI system instructions
│       └── cache.js           # In-memory response caching
│
├── extension/
│   ├── manifest.json          # Chrome Extension Manifest V3
│   ├── background.js          # Secure Service Worker (Fetch Proxy)
│   ├── content.js             # UI + Shadow DOM injection
│   ├── config.js              # Local Extension Secret Key (Not tracked in Git)
│   ├── config.example.js      # Public example of extension configuration
│   └── icons/
│
└── .gitignore                 # Root gitignore protecting private config files
```

---

## ⚡ Quick Start

### 1. Set Up the Secure Backend

```bash
cd backend

# Install dependencies (Express, Google Generative AI, Helmet, Rate-Limit, Cors)
npm install

# 1. Rename .env.example to .env
# 2. Add your FREE Google Gemini API key: https://aistudio.google.com/app/apikey
# 3. Create a unique EXTENSION_SECRET_KEY to prevent bot abuse
```

Start the backend:
```bash
npm run dev
```

The server starts at `http://localhost:3002`.

### 2. Configure the Chrome Extension

1. In the `extension/` folder, rename `config.example.js` to `config.js`.
2. Add the exact same password you used for `EXTENSION_SECRET_KEY` into `config.js`.
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable **Developer mode** (toggle in top-right)
5. Click **"Load unpacked"** and select the `extension/` folder.
6. Check your new Chrome Extension ID and paste it into `CORS_ORIGIN` in your backend `.env` file to fully lock down your server!

### 3. Start Using It

- **Right-click** on selected text → choose an AI action.
- Press **Ctrl+Shift+Y** to open the assistant anytime.
- Click the **floating purple ✦ button** on any page.
- Hit **📄 Export PDF** to instantly download your chat thread.

---

## 🔧 Environment Configuration

### Backend `.env`

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key (Free Tier Supported) |
| `PORT` | Local dev port (default: `3002`) |
| `CORS_ORIGIN` | Your extension ID (`chrome-extension://YOUR_UUID_HERE`) |
| `EXTENSION_SECRET_KEY` | Custom password protecting your server from unauthorized spam bots |
| `RATE_LIMIT_MAX` | Max requests per 15 minutes to deter spam |

---

## 🛡️ Enterprise-Grade Security Built-in

Moving beyond a prototype, this extension features a heavily armored backend architecture safe for public deployment:

- ✅ **Secret Auth Handshake:** The extension passes a Bearer token (`EXTENSION_SECRET_KEY`) dynamically to your cloud server, preventing strangers/bots from stealing your AI credits.
- ✅ **CORS Lockdown:** Your backend drops all requests that don't originate natively from your specific Chrome Extension ID.
- ✅ **HTTP Armor (Helmet):** `helmet` middleware strips identifying server data preventing scanner-based attacks.
- ✅ **Payload Limits:** Node.js explicitly blocks any request body larger than `50kb` to stop memory-exhaustion attacks.
- ✅ **Reverse-Proxy Ready:** Rate limiting configured cleanly with `trust proxy` so it works flawlessly behind AWS / Render / Heroku load balancers.
- ✅ **Shadow DOM:** Frontend UI elements cannot be hijacked or read by the internal websites you visit.

---

## 📝 Permissions Used

| Permission | Reason |
|---|---|
| `contextMenus` | Right-click menu items |
| `activeTab` | Access current tab content intelligently |
| `scripting` | Inject content scripts into DOM |
| `storage` | Save chat history securely to browser |

*Host Permissions explicitly restricted to your isolated API environment for rapid Chrome Web Store automated approval compliance.*

---

## 📄 License
MIT License — free for personal and commercial use.
