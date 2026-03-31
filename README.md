# SIGIL v4 — AI-Powered Dependency Execution Firewall

**SIGIL** (Security Intelligence & Global Identification Layer) is a next-generation security firewall designed to intercept and analyze third-party dependencies (npm, pip, yarn, pnpm) before they ever touch your production environment.

In an era of increasing supply-chain attacks, SIGIL acts as a protective shield, scoring every package for risk and preventing malicious code from executing on your system.

---

## 🚀 Key Features

- **🛡 AI-Powered Risk Scoring**: Every package is analyzed and scored from 0–100 using a combination of heuristics, a known-threat database, and deep static analysis.
- **⚡ Real-Time Execution Firewall**: Intercepts `npm install` or `pip install` commands. Malicious packages are blocked instantly, while suspicious ones are safely isolated.
- **📦 Sandbox Quarantine**: Packages with medium risk scores are automatically installed in a `.sigil_sandbox/` directory, allowing you to inspect them without risking your project's integrity.
- **🔍 Deep Static Analysis**: Scans package install scripts and source stubs for dangerous patterns like `eval()`, `exec()`, `os.system()`, base64 obfuscation, and unauthorized network calls.
- **🔒 Persistent Audit Trail**: Every scan, decision, and block is logged in real-time to a Firebase-backed global registry for compliance and security auditing.
- **📊 Live Security Dashboard**: A modern, real-time web interface to monitor scans, view detailed risk analytics, and manage quarantined packages across your entire organization.

---

## 📈 Market Research & Problem Statement

### The Problem: Supply Chain Vulnerability
Modern software development relies heavily on open-source packages. However, this ecosystem is increasingly targeted by:
- **Typosquatting**: Malicious packages mimicking popular ones (e.g., `colourama` vs `colorama`).
- **Dependency Confusion**: Tricking package managers into downloading malicious internal-named packages from public registries.
- **Malicious Install Scripts**: Packages that execute data-exfiltrating code during the installation phase.

### The SIGIL Solution
Current security tools (like `npm audit`) only check for *known* vulnerabilities in *installed* packages. **SIGIL** shifts security left by analyzing packages *before* they are installed, providing a proactive defense against zero-day supply chain attacks.

---

## 🛠 Tech Stack

- **Backend**: Python 3.10+, FastAPI, Uvicorn (Heuristic Engine & API)
- **Frontend**: Next.js 14, React, Tailwind CSS (Security Dashboard)
- **Database/Auth**: Firebase (Persistence & User Management)
- **SDK**: Node.js (CLI Tool & Execution Interceptor)

---

## 🚦 Getting Started

### 1. Backend Setup
The backend serves as the brain of SIGIL, running the analysis engine.

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup
The dashboard provides real-time monitoring and analytics.

```bash
cd frontend
npm install
npm.cmd run dev  # Usually runs on http://localhost:3000
```

### 3. SDK Installation
The SDK is the CLI tool used by developers to install packages safely.

```bash
cd sdk
npm install -g .
```

---

## 📖 How to Use

### Step 1: Initialize SIGIL
Generate your unique Connection ID to sync your local activity with the global dashboard.
```bash
sigil init
```

### Step 2: Install Packages Safely
Instead of using `npm install` or `pip install` directly, use the `sigil` command:

```bash
# Universal wrapper for ANY command
sigil run "pip install requests"
sigil run "apt install curl"
sigil run "npm install express"

# Legacy / Specific install commands
# Safe package (Risk 0-44) -> Installed normally
sigil install requests

# Suspicious package (Risk 45-74) -> Quarantined to .sigil_sandbox/
sigil install requestx --npm

# Malicious package (Risk 75-100) -> BLOCKED, nothing installed
sigil install crypto-stealer
```

### Step 3: Monitor via Dashboard
1. Open [http://localhost:3000](http://localhost:3000)
2. Log in or create an account.
3. Enter your **Connection ID** (from `sigil status`) to view your live security feed.

---

## ⚖️ Decision Engine Logic

| Risk Score | Status | Action Taken |
| :--- | :--- | :--- |
| **0 – 44** | ✅ **ALLOWED** | Package is verified safe and installed normally. |
| **45 – 74** | ⚠️ **QUARANTINED** | Package is isolated in `.sigil_sandbox/` for manual review. |
| **75 – 100** | ⛔ **BLOCKED** | Execution is halted; no files are written to disk. |

---

## 🛡 Security Note
*For development and demonstration purposes, the Content Security Policy (CSP) has been relaxed. In a production environment, ensure CSP headers are re-enabled and configured for your specific domain requirements.*

---

**SIGIL** — *Securing the foundation of your software, one package at a time.*
