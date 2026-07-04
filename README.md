# GW2 Companion

A voice-first Guild Wars 2 companion app. Ask it about builds, encounters, economy, and events — hands-free while you play.

## Features

- 🎙️ Voice input via Web Speech API (Chrome/Edge)
- 🔊 Voice output via SpeechSynthesis
- ⚔️ Claude-powered GW2 expert (builds, mechanics, meta)
- ⏱️ Live meta event timers with imminence alerts
- 💬 Full conversation history per session

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create gw2-companion --public --push
```

### 2. Import to Vercel

Go to [vercel.com/new](https://vercel.com/new), import your GitHub repo.

Framework preset: **Vite**

### 3. Add your API key

In Vercel → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY = sk-ant-...
```

Redeploy after adding the variable.

### 4. Open in Chrome

Voice input requires Chrome or Edge. Works on Android Chrome too.

## Local development

```bash
npm install
```

Create `.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

```bash
npm run dev
```

## Project structure

```
gw2-companion/
├── api/
│   └── chat.js          # Vercel serverless function (API key lives here)
├── src/
│   ├── main.jsx
│   ├── App.jsx          # Main component
│   └── index.css
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

## Voice tips

- Use Chrome or Edge — Firefox doesn't support Web Speech API
- Works great on Android Chrome for phone-beside-monitor use
- Voice selector lets you choose between available system voices
