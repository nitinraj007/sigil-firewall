# 🚀 SIGIL — AI-Powered Dependency Firewall

> Stop malicious packages **before they execute**.

SIGIL is a next-generation developer security tool that intercepts package installations (npm, pip, etc.) and uses AI-powered risk analysis to detect, quarantine, or block malicious dependencies in real-time.

⚡ Built for modern developers  
🛡 Designed for supply-chain security  
📊 Powered by AI + real-time dashboard
---

## Table of Contents

1. [What is SIGIL?](#1-what-is-sigil)
2. [How it works](#2-how-it-works)
3. [System architecture](#3-system-architecture)
4. [Project structure](#4-project-structure)
5. [Prerequisites](#5-prerequisites)
6. [Quick start (your own machine)](#6-quick-start)
7. [SDK usage](#7-sdk-usage)
8. [Dashboard walkthrough](#8-dashboard-walkthrough)
9. [Deploying to production](#9-deploying-to-production)
10. [Customising SIGIL for your own use](#10-customising-sigil-for-your-own-use)
    - Firebase setup
    - Environment variables
    - Backend origins
    - Ollama / AI model
    - Branding
11. [API reference](#11-api-reference)
12. [Known-risk database](#12-known-risk-database)
13. [Security model](#13-security-model)
14. [Troubleshooting](#14-troubleshooting)
15. [Color palette & design system](#15-color-palette--design-system)

---

## 1. What is SIGIL?

SIGIL is an open-source **developer security SDK + real-time dashboard** that intercepts every `npm install` and `pip install`, runs an AI-powered risk analysis, and streams the decision (allow / quarantine / block) to a live web dashboard.

### The problem it solves

Supply chain attacks are now one of the most common attack vectors against developers:

- **Typosquatting** — `colourama` instead of `colorama`, waiting for a typo
- **Dependency confusion** — private package names published publicly with malicious code
- **Cryptominer payloads** — packages that mine crypto silently in the background
- **Data exfiltration** — packages that read environment variables and send them to attackers

SIGIL catches these **before** the package executes in your environment.

### Who is it for?

| User | Use case |
|---|---|
| Individual developers | Protect local installs across npm and pip without changing workflow |
| Dev teams / startups | Shared security visibility across everyone's machines via one dashboard |
| DevOps / CI pipelines | Add SIGIL to CI to scan dependencies before they enter production |
| Enterprises | Audit trail of every package installed across the organisation |

---

## 2. How it works

```
Developer terminal          SIGIL SDK              Backend (FastAPI)        Dashboard (Next.js)
─────────────────           ─────────────          ─────────────────────    ───────────────────
npm install express    →    intercepts             POST /api/scan           polls GET /api/logs
pip install pandas     →    sends package    →     AI scores risk      →    shows live decision
                            + connection ID        stores in memory         every 2 seconds
```

**Step by step:**

1. Developer runs `sigil init` → generates a unique `SIGIL-XXXX-XXXX` connection ID
2. Developer runs `sigil install pandas` (instead of `pip install pandas`)
3. SIGIL SDK sends the package name + connection ID to the backend via `POST /api/scan`
4. Backend asks Ollama/Mistral to analyze the package — or uses the known-risk fast-path
5. Backend returns a risk score (0–100) and a decision: `allowed`, `suspicious`, or `blocked`
6. SDK prints the result in the terminal with a coloured risk bar
7. Dashboard (open in browser) polls the backend every 2 seconds and shows the new log entry live

---

## 3. System architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         SIGIL System                            │
│                                                                 │
│  ┌──────────────┐   POST /api/scan   ┌──────────────────────┐  │
│  │  SIGIL SDK   │ ─────────────────▶ │   FastAPI Backend    │  │
│  │  (Node CLI)  │                    │   localhost:8000     │  │
│  │              │ ◀─ risk + status ─ │                      │  │
│  └──────────────┘                    │  ┌────────────────┐  │  │
│                                      │  │  Ollama/Mistral│  │  │
│  ┌──────────────┐  GET /api/logs     │  │  AI Engine     │  │  │
│  │  Dashboard   │ ─────────────────▶ │  └────────────────┘  │  │
│  │  Next.js     │ ◀─ log entries ──  │                      │  │
│  │  localhost:  │   (every 2s)       │  In-memory log store │  │
│  │  3000        │                    └──────────────────────┘  │
│  └──────────────┘                                               │
│                                                                 │
│  Optional: Firebase Realtime DB for persistent log storage      │
└─────────────────────────────────────────────────────────────────┘
```

**Tech stack:**

| Layer | Technology |
|---|---|
| SDK CLI | Node.js (no dependencies) |
| Backend | Python 3.11+, FastAPI, Uvicorn |
| AI engine | Ollama + Mistral 7B (local LLM) |
| Frontend | Next.js 14, React 18, TypeScript |
| Styling | CSS variables + glassmorphism (no Tailwind runtime) |
| Optional DB | Firebase Realtime Database |

---

## 4. Project structure

```
sigil_final/
│
├── backend/
│   ├── main.py          ← FastAPI app, all API endpoints, security middleware
│   ├── ai_engine.py     ← Ollama/Mistral integration + known-risk fast-path
│   └── requirements.txt ← Python dependencies
│
├── frontend/
│   ├── pages/
│   │   ├── _app.tsx     ← App wrapper (NO CSP meta tag — handled in next.config.js)
│   │   ├── index.tsx    ← Landing page
│   │   └── dashboard.tsx← Main dashboard shell with tab routing
│   ├── components/
│   │   ├── LiveFeed.tsx ← Connect form + stat cards + log table
│   │   ├── Analytics.tsx← Charts: donuts, histogram, timeline
│   │   ├── Packages.tsx ← Package list with search + filter + sort
│   │   └── types.ts     ← Shared TypeScript interfaces
│   ├── lib/
│   │   ├── firebase.ts  ← Firebase init + helper functions
│   │   └── security.ts  ← Frontend security utilities
│   ├── styles/
│   │   └── globals.css  ← Design tokens + base styles
│   ├── next.config.js   ← CSP headers, Next.js config
│   ├── .env.local       ← Your environment variables (never commit this)
│   └── package.json
│
├── sdk/
│   ├── bin/
│   │   └── sigil.js     ← CLI entry point (all SDK logic)
│   └── package.json
│
└── start.sh             ← Convenience script to start everything
```

---

## 5. Prerequisites

Install these before you start:

| Tool | Version | Install |
|---|---|---|
| Node.js | 18+ | https://nodejs.org |
| Python | 3.11+ | https://python.org |
| Ollama | Latest | https://ollama.ai |
| Git | Any | https://git-scm.com |

**Pull the Mistral model** (required for AI analysis, one-time download ~4GB):

```bash
ollama pull mistral
```

> **No Ollama?** SIGIL still works. The AI engine falls back to a known-risk database for common packages. Unknown packages get a default "allowed" score of 20.

---

## 6. Quick Start

### Step 1 — Clone the repo

```bash
git clone https://github.com/yourname/sigil.git
cd sigil/sigil_final
```

### Step 2 — Start the backend

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate it
# On Mac/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

Backend is now running at **http://localhost:8000**
API docs are at **http://localhost:8000/docs**

### Step 3 — Start Ollama (in a separate terminal)

```bash
ollama serve
# Ollama is now at http://localhost:11434
```

### Step 4 — Start the frontend

```bash
cd frontend

# Copy environment file
cp .env.local.example .env.local
# Edit .env.local if needed (see Section 10)

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend is now running at **http://localhost:3000**

### Step 5 — Use the SDK

```bash
# Make the CLI executable
chmod +x sdk/bin/sigil.js

# Generate your connection ID
node sdk/bin/sigil.js init

# Scan packages
node sdk/bin/sigil.js install pandas
node sdk/bin/sigil.js install express --npm
node sdk/bin/sigil.js install crypto-stealer   # ← will be BLOCKED
```

### Step 6 — Open the dashboard

1. Go to **http://localhost:3000/dashboard**
2. Paste your Connection ID (e.g. `SIGIL-K7P2-X4NM`)
3. Click **Connect**
4. Run installs in your terminal — watch them appear live

---

## 7. SDK Usage

### Installation

```bash
# Option A: run directly
node path/to/sdk/bin/sigil.js <command>

# Option B: install globally (from sdk/ folder)
npm install -g .
sigil <command>
```

### Commands

```bash
sigil init                     # Generate a new connection ID
sigil init --reset             # Delete existing ID and generate a new one
sigil install <package>        # Scan + log a pip package
sigil install <package> --npm  # Scan + log an npm package
sigil status                   # Show current connection ID and backend URL
sigil help                     # Show all commands
```

### Environment variables (SDK)

```bash
# Point SDK at a different backend (e.g. deployed server)
SIGIL_API=https://api.yourdomain.com node sdk/bin/sigil.js install pandas
```

### Where the connection ID is stored

```
~/.sigil/config.json
```

Contents:
```json
{
  "connectionId": "SIGIL-K7P2-X4NM",
  "initializedAt": "2026-03-29T12:00:00.000Z"
}
```

---

## 8. Dashboard walkthrough

### Live Feed tab
- Shows a stat bar: Total / Allowed / Quarantined / Blocked
- Live log table with animated row entry for new packages
- Risk score bar (green = safe, yellow = warn, red = danger)
- Polls backend every 2 seconds automatically

### Analytics tab
- **Decision breakdown** — donut rings for allow/quarantine/block ratios
- **Risk score distribution** — histogram bucketed into five ranges
- **Package manager split** — bar chart showing npm vs pip
- **Recent activity** — chronological timeline of last 10 installs

### Packages tab
- Summary cards for your top 4 most-scanned packages
- **Search** — filter by package name
- **Status filter** — all / allowed / blocked / quarantined
- **Manager filter** — all / npm / pip
- **Sortable columns** — click any column header to sort

---

## 9. Deploying to Production

### Backend (Render / Railway / Fly.io)

```bash
# requirements.txt already includes everything needed
# Set these environment variables in your hosting dashboard:

ENVIRONMENT=production
```

Update `ALLOWED_ORIGINS` in `backend/main.py`:

```python
ALLOWED_ORIGINS = [
    "https://yourdomain.com",        # your production frontend URL
    "https://www.yourdomain.com",
]
```

### Frontend (Vercel — recommended)

```bash
# From the frontend/ folder:
vercel deploy
```

Set these in Vercel's environment variables dashboard:

```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_DATABASE_URL=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### Production CSP (next.config.js)

The `next.config.js` already switches automatically:
- **Dev** (`NODE_ENV=development`): includes `'unsafe-eval'` for HMR
- **Prod** (`NODE_ENV=production`): removes `'unsafe-eval'`, tighter policy

---

## 10. Customising SIGIL for Your Own Use

These are every place you need to change if you fork SIGIL and run it yourself.

---

### 🔥 Firebase — the most important change

Firebase stores persistent logs. You need your own Firebase project.

**Step 1: Create a Firebase project**
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it anything → continue
3. Enable **Realtime Database** (not Firestore) → start in test mode
4. In Project Settings → Your apps → add a Web app → copy the config

**Step 2: Replace the config in two places**

**`frontend/lib/firebase.ts`** — replace the entire `firebaseConfig` object:

```typescript
// ❌ REPLACE THIS (current config belongs to the original developer)
export const firebaseConfig = {
  apiKey:            'AIzaSyDHStmhxnW_tyXsPbE6E76Df40T7ksehtI',  // ← change
  authDomain:        'sigil-222de.firebaseapp.com',               // ← change
  databaseURL:       'https://sigil-222de-default-rtdb.firebaseio.com', // ← change
  projectId:         'sigil-222de',                               // ← change
  storageBucket:     'sigil-222de.firebasestorage.app',           // ← change
  messagingSenderId: '285624051445',                              // ← change
  appId:             '1:285624051445:web:dc5d94bca79c8747a447bc', // ← change
  measurementId:     'G-7QTWET0RMR',                             // ← change
}

// ✅ REPLACE WITH YOUR OWN:
export const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}
```

**`frontend/.env.local`** — replace all Firebase values:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000

# ← Replace ALL of these with your Firebase project values
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...YOUR_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef
```

> **Note:** Firebase public config keys are safe to expose in frontend code — this is by design. They only identify your project; Firebase Security Rules control what data can actually be read/written.

---

### Environment variables — full list

**`frontend/.env.local`**

```env
# Required — points frontend at your backend
NEXT_PUBLIC_API_URL=http://localhost:8000

# Optional — only needed if you use Firebase persistence
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_DATABASE_URL=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

> ⚠️ **Never commit `.env.local`** — it's in `.gitignore` by default. Use `.env.local.example` as the template.

---

### Backend — allowed origins

**`backend/main.py`**, around line 25:

```python
# ❌ Current (includes original developer's domains)
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://sigil-dashboard.vercel.app",   # ← remove this
    "https://sigil.delvrixo.com",           # ← remove this
]

# ✅ Replace with your own domains
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://YOUR-APP.vercel.app",          # ← your Vercel URL
    "https://yourdomain.com",               # ← your custom domain
]
```

---

### AI model — Ollama

The AI engine uses Mistral 7B by default. To change the model:

**`backend/ai_engine.py`**, line 9:

```python
# ❌ Current
OLLAMA_MODEL = "mistral"

# ✅ Any model you have pulled locally
OLLAMA_MODEL = "llama3"       # Meta Llama 3
OLLAMA_MODEL = "gemma3"       # Google Gemma 3
OLLAMA_MODEL = "phi3"         # Microsoft Phi-3
OLLAMA_MODEL = "qwen2"        # Alibaba Qwen 2
```

Pull your chosen model first:
```bash
ollama pull llama3
```

> **No Ollama at all?** In `ai_engine.py` you can replace the `analyze_package()` function with a pure heuristic scorer if you don't want a local LLM dependency.

---

### Known-risk database

Add your own known-safe or known-malicious packages in **`backend/ai_engine.py`**:

```python
KNOWN: dict[str, dict] = {
    # Add known malicious packages
    "your-malicious-pkg": {
        "risk_score": 99,
        "status":     "blocked",
        "reason":     "Known malware — internal blocklist.",
    },
    # Add your company's private packages as trusted
    "your-company-internal": {
        "risk_score": 2,
        "status":     "allowed",
        "reason":     "Internal company package — verified.",
    },
    # ... existing entries below
}
```

---

### Branding

| What | Where |
|---|---|
| App name "SIGIL" | `frontend/pages/index.tsx` and `dashboard.tsx` — search for "SIGIL" |
| Favicon / tab icon | `frontend/public/favicon.ico` — replace the file |
| Color palette | `frontend/styles/globals.css` — change `--orange`, `--lavender`, etc. |
| Logo glyph `◈` | `frontend/pages/dashboard.tsx` sidebar brand div |
| Page title | `<Head><title>` in `index.tsx` and `dashboard.tsx` |

---

## 11. API Reference

All endpoints are at `http://localhost:8000`.

### `GET /`
Health ping.
```json
{ "status": "ok", "message": "SIGIL AI backend v3.1" }
```

### `GET /health`
Full health check including Ollama status.
```json
{
  "status": "ok",
  "ollama": "active",
  "ai": "ollama/mistral",
  "connections": 3,
  "total_logs": 47
}
```

### `POST /api/connect`
Register a connection ID.
```json
// Request
{ "connection_id": "SIGIL-K7P2-X4NM" }

// Response
{ "connection_id": "SIGIL-K7P2-X4NM", "connected": true, "timestamp": "..." }
```

### `POST /api/scan`
Primary scan endpoint — called by `sigil install`.
```json
// Request
{
  "connection_id": "SIGIL-K7P2-X4NM",
  "package": "pandas",
  "manager": "pip",
  "timestamp": "2026-03-29T12:00:00Z"
}

// Response
{
  "success": true,
  "log_id": 7,
  "package": "pandas",
  "risk_score": 4,
  "status": "allowed",
  "reason": "Official, widely-audited PyPI package."
}
```

### `GET /api/logs?connection_id=SIGIL-K7P2-X4NM`
Returns all logs for a connection ID, newest first.
```json
{
  "connection_id": "SIGIL-K7P2-X4NM",
  "logs": [
    {
      "id": 7,
      "package": "pandas",
      "manager": "pip",
      "status": "allowed",
      "risk_score": 4,
      "reason": "Official PyPI package.",
      "timestamp": "2026-03-29T12:00:00Z"
    }
  ],
  "total": 1
}
```

### `GET /api/stats?connection_id=SIGIL-K7P2-X4NM`
Aggregated stats.
```json
{
  "total": 12,
  "allowed": 9,
  "blocked": 2,
  "quarantined": 1,
  "avg_risk": 18.4
}
```

---

## 12. Known-Risk Database

Packages with hard-coded scores (bypass the AI for speed):

| Package | Risk | Decision | Reason |
|---|---|---|---|
| `crypto-stealer` | 98 | BLOCKED | Known cryptominer payload |
| `malicious-pkg` | 96 | BLOCKED | Confirmed data-exfiltration |
| `colourama` | 92 | BLOCKED | Typosquatting 'colorama' |
| `requestx` | 85 | BLOCKED | Dependency confusion attack |
| `typosquatter` | 82 | BLOCKED | Generic typosquatting pattern |
| `nodemailer-safe` | 74 | SUSPICIOUS | Impersonating 'nodemailer' |
| `pandas` | 4 | ALLOWED | Official PyPI package |
| `numpy` | 3 | ALLOWED | Official PyPI package |
| `react` | 5 | ALLOWED | Official npm package |
| `express` | 7 | ALLOWED | Official npm package |
| `fastapi` | 4 | ALLOWED | Official PyPI package |
| `requests` | 6 | ALLOWED | Official PyPI package |

Unknown packages are sent to Ollama. If Ollama is offline, they get score 20 / allowed.

---

## 13. Security Model

### What SIGIL does protect against
- Known malicious packages (fast-path database)
- Typosquatting attacks on common package names
- Packages flagged by the AI as suspicious
- Gives you a full audit log of every install decision

### What SIGIL does NOT do
- It does not inspect package source code in real-time
- It does not cryptographically verify package signatures (that's `pip --verify` / npm provenance)
- It does not replace a full SCA (Software Composition Analysis) tool like Snyk or Dependabot
- The AI can make mistakes — treat its output as a risk signal, not ground truth

### Backend security layers
| Layer | Implementation |
|---|---|
| CORS | Restricted to explicit origin allowlist |
| Rate limiting | 60 requests/minute per IP, in-memory |
| Input validation | Package name regex `[a-zA-Z0-9@/_.\\-]{1,214}` |
| XSS detection | Regex scan for `<script`, `eval(`, `javascript:` etc. |
| Payload limit | 10 KB max per POST body |
| CSRF | Double-submit cookie on every response |
| Security headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` |

---

## 14. Troubleshooting

### ❌ Blank white page / EvalError CSP

**Cause:** A `Content-Security-Policy` meta tag without `'unsafe-eval'`.

**Fix:** Make sure `frontend/pages/_app.tsx` has NO CSP meta tag. CSP lives in `next.config.js` only.

```bash
rm -rf frontend/.next    # delete build cache
npm run dev              # restart
```

### ❌ `Connection 'SIGIL-XXXX' not found`

The backend resets when restarted (in-memory storage). You need to reconnect:

```bash
node sdk/bin/sigil.js init --reset   # get a new ID
# Then reconnect in the dashboard with the new ID
```

### ❌ `ERR_CONNECTION_REFUSED` on localhost:8000

The backend is not running. Start it:

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### ❌ `ollama: command not found`

Ollama is not installed. SIGIL still works — it falls back to the known-risk database. Install from https://ollama.ai if you want AI analysis for unknown packages.

### ❌ Firebase errors in console

You haven't replaced the Firebase config. Either:
1. Replace the values in `lib/firebase.ts` and `.env.local` with your own project (see Section 10)
2. Or remove Firebase entirely — SIGIL works fine without it (logs are stored in backend memory)

### ❌ SDK sends to wrong backend URL

The SDK reads `SIGIL_API` environment variable:

```bash
SIGIL_API=http://your-server:8000 node sdk/bin/sigil.js install pandas
```

Or edit the default in `sdk/bin/sigil.js` line 8:
```js
const BACKEND_URL = process.env.SIGIL_API || 'http://localhost:8000'
```

---

## 15. Color Palette & Design System

From the official SIGIL brand plates:

| Name | Hex | CSS Variable | Usage |
|---|---|---|---|
| Orange | `#EA663D` | `--orange` | Primary brand, CTAs, glow accents |
| Lavender | `#AAAAD5` | `--lavender` | Secondary accent, npm badge |
| Purple | `#C284B8` | `--purple` | Gradient highlights |
| Steel Blue | `#9BBED3` | `--steel` | Info states |
| Gold | `#EAC642` | `--gold` / `--warn` | Quarantine / warning status |
| Lime | `#C5D545` | `--lime` / `--safe` | Allowed / safe status |
| Light Grey | `#D1D1D1` | `--grey-light` | Muted text |
| Off White | `#EEEDED` | `--off-white` / `--text` | Body text, backgrounds |

**Status colours:**

```
✓ Allowed     → #C5D545 (lime)
⚠ Quarantine  → #EAC642 (gold)
✗ Blocked     → #FF4444 (red)
```

**Typography:**
- Display / UI: `Syne` (Google Fonts) — bold, geometric
- Code / mono: `JetBrains Mono` (Google Fonts) — terminal feel

---

## License

MIT — free to use, modify, and distribute. Attribution appreciated.

---

## Credits

Built for hackathon demo. Stack: FastAPI · Ollama/Mistral · Next.js 14 · Firebase · Node.js CLI.

```
  ███████╗██╗ ██████╗ ██╗██╗
  ██╔════╝██║██╔════╝ ██║██║
  ███████╗██║██║  ███╗██║██║
  ╚════██║██║██║   ██║██║██║
  ███████║██║╚██████╔╝██║███████╗
  ╚══════╝╚═╝ ╚═════╝ ╚═╝╚══════╝
  Dependency Security SDK v2.0
```
