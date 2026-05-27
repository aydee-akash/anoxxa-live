# Anoxaa — Realtime Voice & Video AI Loan Officer ("Ken")

Anoxaa runs a personal-loan application **end-to-end over a live video call**.
You talk to **Ken**, an AI loan officer who speaks Hindi / Hinglish / Indian
English, walks you through eligibility, terms and EMI, and gets you to a
decision in minutes — no forms, no branch visit.

It's built on **LiveKit Agents (Python)**: the framework owns the realtime loop
(VAD, streaming STT, LLM orchestration, streaming TTS, model-based turn
detection, barge-in, adaptive interruption). We configure the built-ins — we do
**not** re-implement them.

> ⚠️ This is a working prototype. The loan tools return **mock** fixture data
> (no real banking integration), so you can drive the full flow without spend.

---

## Features

- 🎙️ **Realtime voice + video call** with an AI loan officer over LiveKit Cloud
- 🌐 **Hindi / Hinglish / Indian-English** speech, tuned for hesitant speakers
  (longer end-of-turn delay, barge-in, false-interruption resume)
- 📝 **Live transcript** streamed to the browser, plus an end-of-call summary
- 💸 **Loan workflow tools** — eligibility, repayment/EMI, consent, onboarding
  status, WhatsApp agreement link (idempotent; numbers come only from tools)
- 🧑‍💼 **Optional talking-head avatar** (Beyond Presence) with automatic
  voice-only fallback
- 🎬 Polished landing page with a cursor-scrubbable image-sequence hero

---

## Architecture

Three processes run together. The browser never mints its own LiveKit token —
a small server does that.

```
   Browser (Vite/React)  ──GET /token──►  Token server  (:8000)
        │  join room (JWT)                  mints LiveKit JWT
        ▼
   LiveKit Cloud (SFU)  ◄─── outbound ───  Agent worker  ("Ken")
        ▲                                   STT → LLM → TTS + tools
        └────── audio / video / transcript ─────────┘
```

| Process | What it does | Command | Port |
|---|---|---|---|
| **Agent worker** | Joins the room as Ken; runs the realtime loop + loan tools | `python -m agent.main dev` | — (outbound only) |
| **Token server** | Mints a short-lived LiveKit JWT for the browser | `python server/token_server.py` | 8000 |
| **Frontend** | The web app the user calls from | `npm run dev` (in `frontend/`) | 5173 |

---

## Tech stack

- **Orchestration:** `livekit-agents` (Python), `AgentSession`
- **Transport:** LiveKit Cloud (managed SFU; the worker is outbound-only — no inbound ports)
- **STT:** Deepgram Nova-3 (`language="en-IN"`)
- **LLM:** Gemini Flash via **OpenRouter** (OpenAI-compatible `openai` plugin)
- **TTS:** Deepgram Aura-2 (reuses the Deepgram key)
- **VAD:** Silero · **Turn detection:** model-based multilingual turn detector
- **Avatar:** Beyond Presence (optional)
- **Frontend:** Vite + React 19 + TypeScript + Tailwind v4 + `livekit-client`

---

## Prerequisites

- **Python 3.10+** and **Node 20+**
- A **LiveKit Cloud** project (URL + API key/secret)
- API keys: **Deepgram** (STT + TTS), **OpenRouter** (LLM); optional **Beyond
  Presence** for the avatar

---

## Setup

### 1. Backend (agent + token server)

```bash
python -m venv .venv
# macOS/Linux:
source .venv/bin/activate
# Windows (PowerShell):  .\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
cp .env.example .env                  # then fill in your keys (see below)
python -m agent.main download-files   # one-time: fetch VAD + turn-detector models
```

### 2. Frontend

```bash
cd frontend
npm install
```

---

## Running

Open **three terminals** (backend ones with the venv active):

```bash
# 1) Agent worker — joins the call as Ken
python -m agent.main dev

# 2) Token server — http://localhost:8000  (GET /token)
python server/token_server.py

# 3) Frontend — http://localhost:5173
cd frontend && npm run dev
```

Then open **http://localhost:5173**, click **Start Video Call**, and allow
camera + mic. The app fetches a token from `:8000`, joins a LiveKit room, and
Ken joins to run the application. A live transcript appears alongside the video.

> 🎧 **Test with headphones first.** Acoustic echo cancellation is the
> browser's job (enabled on the mic track). Without headphones the agent can
> hear itself and loop.

---

## Configuration

All config is environment-driven (see `.env.example`).

| Variable | Purpose | Required |
|---|---|---|
| `LIVEKIT_URL` | LiveKit Cloud `wss://…` URL | ✅ |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Token minting + worker auth | ✅ |
| `DEEPGRAM_API_KEY` | STT (Nova-3) **and** TTS (Aura-2) | ✅ |
| `OPENROUTER_API_KEY` | LLM (Gemini Flash via OpenRouter) | ✅ |
| `STT_MODEL` / `STT_LANGUAGE` | Defaults `nova-3` / `en-IN` | — |
| `DEEPGRAM_TTS_MODEL` | Default `aura-2-cordelia-en` | — |
| `LLM_MODEL` | OpenRouter model id | — |
| `AVATAR_ENABLED` | `true` to enable the Beyond Presence avatar | — (default off) |
| `BEY_API_KEY` / `BEY_AVATAR_ID` | Avatar credentials | only if avatar on |
| `PROFILE` | `prod` (require keys) or `dev` (skip checks for a smoke test) | — |
| `TOKEN_SERVER_PORT` | Token server port | — (default 8000) |
| `VITE_TOKEN_URL` | Frontend token endpoint override (for prod) | — |

**Avatar toggle:** set `AVATAR_ENABLED=false` to test voice-only — the UI shows
an animated avatar instead of the talking head, and the Beyond Presence API
isn't called at all.

**Windows note:** run the Python processes with `PYTHONUTF8=1` (the token-server
banner and Hindi/Hinglish transcripts are non-ASCII), and create the `.venv`
natively on Windows rather than reusing one built on macOS/Linux.

---

## Project structure

```
.
├── agent/                  # LiveKit voice agent ("Ken")
│   ├── main.py             # worker entrypoint + AgentSession wiring
│   ├── config.py           # env-driven config (models, keys, turn-taking)
│   ├── prompts/            # system prompt — persona + loan flow
│   └── tools/              # loan tools (mock: eligibility, EMI, consent, …)
├── server/
│   └── token_server.py     # mints LiveKit JWTs for the browser (:8000)
├── frontend/               # Vite + React 19 + TS app
│   ├── src/
│   │   ├── components/      # Hero, FrameScrubber
│   │   ├── pages/           # CallExperience (video + live transcript + summary)
│   │   ├── hooks/ · lib/
│   │   └── …
│   └── public/frames/       # hero image-sequence (97 JPEGs)
├── requirements.txt
└── .env.example
```

---

## Smoke test without keys

Set `PROFILE=dev` in `.env` and run `python -m agent.main` (no subcommand) to
confirm the worker imports and builds without provider keys.
