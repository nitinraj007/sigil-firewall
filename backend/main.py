"""
SIGIL v4 — AI-Powered Dependency Execution Firewall
FastAPI Backend: Risk scoring, static analysis, heuristics, sandbox, Firebase persistence
"""

import re, uuid, time, os, hashlib, asyncio, json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="SIGIL API v4", version="4.0.0", docs_url="/docs")

# ── CORS (wildcard in dev) ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# ── Rate limiting ──────────────────────────────────────────────────────────────
_rate: dict = defaultdict(lambda: {"count": 0, "reset": 0})

def _check_rate(ip: str, limit=120, window=60) -> bool:
    now = time.time()
    b = _rate[ip]
    if now > b["reset"]:
        b["count"] = 1; b["reset"] = now + window; return True
    b["count"] += 1
    return b["count"] <= limit

@app.middleware("http")
async def rate_limit_mw(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    if not _check_rate(ip):
        return JSONResponse({"detail": "Rate limit exceeded"}, 429)
    return await call_next(request)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"]         = "DENY"
    resp.headers["Referrer-Policy"]          = "strict-origin-when-cross-origin"
    return resp

# ── Known risk database ────────────────────────────────────────────────────────
KNOWN_MALICIOUS = {
    "crypto-stealer":   {"score": 98, "flags": ["cryptominer","data-exfil"],   "reason": "Known cryptominer payload — immediate block"},
    "malicious-pkg":    {"score": 96, "flags": ["data-exfil","backdoor"],       "reason": "Confirmed data exfiltration package"},
    "colourama":        {"score": 92, "flags": ["typosquatting"],               "reason": "Typosquatting 'colorama' — known attack"},
    "requestx":         {"score": 85, "flags": ["dep-confusion","typosquatting"],"reason": "Dependency confusion mimicking 'requests'"},
    "typosquatter":     {"score": 82, "flags": ["typosquatting"],               "reason": "Generic typosquatting pattern"},
    "nodemailer-safe":  {"score": 74, "flags": ["impersonation"],               "reason": "Impersonating 'nodemailer' package"},
    "setup-tools":      {"score": 79, "flags": ["impersonation","typosquatting"],"reason": "Typosquatting 'setuptools'"},
    "python-jwt":       {"score": 68, "flags": ["impersonation"],               "reason": "Impersonating 'PyJWT'"},
    "openai-api":       {"score": 71, "flags": ["impersonation"],               "reason": "Impersonating official 'openai' package"},
    "event-stream":     {"score": 88, "flags": ["supply-chain","backdoor"],     "reason": "Historical supply-chain attack vector"},
}

KNOWN_SAFE = {
    "pandas":    {"score": 4,  "reason": "Official PyPI — 500M+ downloads, verified"},
    "numpy":     {"score": 3,  "reason": "Official PyPI — Scientific computing foundation"},
    "react":     {"score": 5,  "reason": "Official npm — Meta maintained"},
    "express":   {"score": 7,  "reason": "Official npm — widely audited"},
    "fastapi":   {"score": 4,  "reason": "Official PyPI — Sebastián Ramírez"},
    "requests":  {"score": 6,  "reason": "Official PyPI — 300M+ downloads"},
    "lodash":    {"score": 8,  "reason": "Official npm — well maintained"},
    "next":      {"score": 5,  "reason": "Official npm — Vercel maintained"},
    "axios":     {"score": 7,  "reason": "Official npm"},
    "uvicorn":   {"score": 4,  "reason": "Official PyPI"},
    "django":    {"score": 4,  "reason": "Official PyPI — Django Foundation"},
    "flask":     {"score": 5,  "reason": "Official PyPI — Pallets"},
    "sqlalchemy":{"score": 5,  "reason": "Official PyPI"},
    "pydantic":  {"score": 4,  "reason": "Official PyPI"},
    "pytest":    {"score": 5,  "reason": "Official PyPI"},
    "typescript":{"score": 5,  "reason": "Official npm — Microsoft"},
    "webpack":   {"score": 6,  "reason": "Official npm"},
    "vite":      {"score": 5,  "reason": "Official npm"},
    "tailwindcss":{"score": 5, "reason": "Official npm"},
    "firebase":  {"score": 6,  "reason": "Official npm — Google"},
    "boto3":     {"score": 6,  "reason": "Official PyPI — AWS"},
    "pillow":    {"score": 5,  "reason": "Official PyPI"},
    "click":     {"score": 5,  "reason": "Official PyPI — Pallets"},
}

# ── Heuristic patterns ─────────────────────────────────────────────────────────
SUSPICIOUS_PATTERNS = {
    "names": [
        r"(steal|stealer|stealr)",
        r"(hack|hacker|hackr)",
        r"(malware|malicious|malici)",
        r"(trojan|virus|worm)",
        r"(rat\b|keylog)",
        r"(cryptominer|miner\b|xmrig)",
        r"(exfil|exfiltr)",
        r"(inject|injector)",
        r"(exploit|bypass|backdoor)",
        r"(reverse.?shell|revshell)",
    ],
    "typos": [
        ("requests",  [r"^request[sx]?$", r"^requets", r"^reqeusts"]),
        ("colorama",  [r"^colou?r[ae]ma$"]),
        ("setuptools",[r"^setup.?tool[s]?$", r"^setup-tools$"]),
        ("numpy",     [r"^num.?py$", r"^numy$"]),
        ("pandas",    [r"^panda[s]?$", r"^pandaz$"]),
        ("pillow",    [r"^pillo[w]?$", r"^PIL.{1,3}$"]),
        ("urllib3",   [r"^url.?lib3?$"]),
        ("cryptography",[r"^crypto.?graphy$"]),
    ],
    "confusion": [r"^[a-z]+-internal$", r"^[a-z]+-private$", r"^[a-z]+-local$"],
}

# ── Inline static analysis patterns ───────────────────────────────────────────
STATIC_DANGER_PATTERNS = [
    (r"eval\s*\(",           "eval() usage — code injection risk",       25),
    (r"exec\s*\(",           "exec() usage — arbitrary execution",        25),
    (r"os\.system\s*\(",     "os.system() — shell execution",             30),
    (r"subprocess\.",        "subprocess usage — shell access",            20),
    (r"base64\.b64decode",   "base64 decode — obfuscation indicator",     18),
    (r"socket\.connect",     "socket.connect — network exfiltration",     22),
    (r"requests\.post.*env", "sending env vars via requests",              35),
    (r"__import__\s*\(",     "dynamic __import__ — evasion technique",     20),
    (r"curl\s+http",         "curl network call in install script",        25),
    (r"wget\s+http",         "wget network call in install script",        25),
    (r"rm\s+-rf",            "rm -rf in install script — destructive",     40),
    (r"chmod\s+\+x",         "chmod +x — making files executable",        15),
    (r"\.encode\('base64'\)","base64 encoding — data obfuscation",        18),
    (r"import\s+ctypes",     "ctypes import — low-level OS access",        22),
]

# ── Storage ────────────────────────────────────────────────────────────────────
connections: dict[str, dict] = {}
logs: list[dict] = []
log_id_counter: int = 0
security_cache: dict[str, dict] = {}   # cache past analysis
webhook_urls: dict[str, str] = {}       # uid → webhook URL
quarantine_store: dict[str, list] = {}  # cid → quarantined packages

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def decide(score: int) -> str:
    if score >= 75:   return "blocked"
    if score >= 45:   return "quarantined"
    return "allowed"

# ── Analysis engine ────────────────────────────────────────────────────────────
def run_heuristics(name: str) -> dict:
    """Run all heuristic checks on a package name."""
    flags = []
    score_boost = 0

    name_lower = name.lower()

    # 1. Suspicious name patterns
    for pat in SUSPICIOUS_PATTERNS["names"]:
        if re.search(pat, name_lower):
            flags.append(f"suspicious-name:{pat}")
            score_boost += 28

    # 2. Typosquatting detection
    for (real_pkg, patterns) in SUSPICIOUS_PATTERNS["typos"]:
        for pat in patterns:
            if re.search(pat, name_lower) and name_lower != real_pkg:
                flags.append(f"typosquatting:{real_pkg}")
                score_boost += 35

    # 3. Dependency confusion
    for pat in SUSPICIOUS_PATTERNS["confusion"]:
        if re.search(pat, name_lower):
            flags.append("dependency-confusion")
            score_boost += 30

    # 4. Length / character anomalies
    if len(name) > 60:
        flags.append("abnormal-name-length")
        score_boost += 15

    if re.search(r'[0-9]{5,}', name_lower):
        flags.append("numeric-spam-in-name")
        score_boost += 12

    # 5. Crypto/suspicious keywords
    if re.search(r'(crypt|wallet|coin|token|blockchain)', name_lower):
        flags.append("crypto-related-name")
        score_boost += 10

    return {"flags": flags, "score_boost": min(score_boost, 70)}

def run_static_analysis(install_snippet: str = "") -> dict:
    """Simulate static code analysis on a package stub."""
    if not install_snippet:
        # Generate a synthetic install snippet for known dangerous packages
        return {"flags": [], "score_boost": 0, "matches": []}

    flags = []
    score_boost = 0
    matches = []

    for pattern, description, weight in STATIC_DANGER_PATTERNS:
        if re.search(pattern, install_snippet, re.IGNORECASE):
            flags.append(description)
            matches.append({"pattern": pattern, "description": description, "weight": weight})
            score_boost += weight

    return {"flags": flags, "score_boost": min(score_boost, 60), "matches": matches}

async def analyze_package(package: str, manager: str) -> dict:
    """Full analysis pipeline: cache → known DB → heuristics → static → decision."""
    name = package.strip().lower()
    cache_key = f"{name}:{manager}"

    # 1. Cache hit
    if cache_key in security_cache:
        cached = security_cache[cache_key].copy()
        cached["cached"] = True
        return cached

    flags = []
    score = 0
    reason = ""
    sources = []

    # 2. Known malicious — fast block
    if name in KNOWN_MALICIOUS:
        m = KNOWN_MALICIOUS[name]
        score = m["score"]
        flags = m["flags"]
        reason = m["reason"]
        sources.append("known-malicious-db")

    # 3. Known safe — fast allow
    elif name in KNOWN_SAFE:
        s = KNOWN_SAFE[name]
        score = s["score"]
        reason = s["reason"]
        sources.append("known-safe-db")

    else:
        # 4. Heuristic analysis
        heuristics = run_heuristics(name)
        score = heuristics["score_boost"]
        flags = heuristics["flags"]
        sources.append("heuristics")

        # 5. Base risk (unknown packages start at 15)
        score = max(score, 15)

        # 6. Manager-specific rules
        if manager == "pip" and re.search(r'^[a-z]{2,4}$', name):
            score += 12  # very short pip names are suspicious
            flags.append("suspicious-short-name")

        reason = (
            f"Heuristic analysis — {len(flags)} flag(s) detected"
            if flags else "Unknown package — heuristic scan passed"
        )

    # 7. Final scoring
    score = max(0, min(100, score))
    status = decide(score)

    result = {
        "risk_score":   score,
        "status":       status,
        "reason":       reason,
        "flags":        flags,
        "sources":      sources,
        "cached":       False,
        "analyzed_at":  now_iso(),
    }

    # Cache result
    security_cache[cache_key] = result
    return result


# ── Input validation ───────────────────────────────────────────────────────────
_PKG_RE  = re.compile(r'^[a-zA-Z0-9@/_.\-\s\'"():]{1,512}$')
_CID_RE  = re.compile(r'^[A-Z0-9\-]{4,30}$')
_JS_PAY  = re.compile(r'<script|javascript:|on\w+=|eval\(|alert\(', re.I)

def clean_pkg(name: str) -> str:
    name = name.strip()[:214]
    if _JS_PAY.search(name): raise HTTPException(400, "Suspicious payload")
    if not _PKG_RE.match(name): raise HTTPException(400, f"Invalid package name: {name!r}")
    return name.lower()

def clean_cid(cid: str) -> str:
    cid = cid.strip().upper()[:30]
    if not _CID_RE.match(cid): raise HTTPException(400, "Invalid connection ID")
    if not cid.startswith("SIGIL-"): raise HTTPException(400, "ID must start with SIGIL-")
    return cid

# ── Models ─────────────────────────────────────────────────────────────────────
class ConnectRequest(BaseModel):
    connection_id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None

class ScanRequest(BaseModel):
    connection_id: str
    package: str
    manager: str = "pip"
    command: Optional[str] = None
    timestamp: Optional[str] = None
    install_snippet: Optional[str] = ""   # for static analysis

class LogRequest(BaseModel):
    connection_id: str
    package: str
    manager: str = "pip"
    command: Optional[str] = None
    status: Optional[str] = None
    risk_score: Optional[int] = None
    timestamp: Optional[str] = None

class WebhookRequest(BaseModel):
    connection_id: str
    webhook_url: str

class QuarantineReleaseRequest(BaseModel):
    connection_id: str
    package: str
    force: bool = False

# ── Helpers ────────────────────────────────────────────────────────────────────
def _register(cid: str, user_id: str = "", user_email: str = ""):
    if cid not in connections:
        connections[cid] = {
            "connection_id": cid,
            "user_id":       user_id,
            "user_email":    user_email,
            "connected_at":  now_iso(),
            "log_count":     0,
        }

def _save_log(cid: str, package: str, manager: str, analysis: dict, ts: str = "", command: str = "") -> dict:
    global log_id_counter
    log_id_counter += 1
    entry = {
        "id":           log_id_counter,
        "connection_id":cid,
        "package":      package,
        "manager":      manager,
        "command":      command,
        "status":       analysis["status"],
        "risk_score":   analysis["risk_score"],
        "reason":       analysis["reason"],
        "flags":        analysis.get("flags", []),
        "sources":      analysis.get("sources", []),
        "cached":       analysis.get("cached", False),
        "timestamp":    ts or now_iso(),
    }
    logs.append(entry)
    
    # Ensure connection exists
    if cid not in connections:
        _register(cid)
    
    connections[cid]["log_count"] = connections[cid].get("log_count", 0) + 1
    
    # Debug logs
    print(f"DEBUG: Scan completed for connection: {cid}")
    print(f"DEBUG: Current logs count: {len(logs)}")
    print(f"DEBUG: Last log entry: {json.dumps(entry, indent=2)}")
    
    return entry

async def _fire_webhook(cid: str, entry: dict):
    """Send webhook if configured and package is high-risk."""
    if entry["status"] != "blocked" or cid not in webhook_urls:
        return
    import httpx
    try:
        payload = {
            "event":      "package_blocked",
            "package":    entry["package"],
            "risk_score": entry["risk_score"],
            "reason":     entry["reason"],
            "timestamp":  entry["timestamp"],
            "connection": cid,
        }
        async with httpx.AsyncClient(timeout=5.0) as c:
            await c.post(webhook_urls[cid], json=payload)
    except Exception:
        pass

# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "version": "4.0.0", "message": "SIGIL v4 — Dependency Execution Firewall"}

@app.get("/health")
async def health():
    return {
        "status":      "healthy",
        "version":     "4.0.0",
        "connections": len(connections),
        "total_logs":  len(logs),
        "cache_size":  len(security_cache),
    }

@app.post("/api/connect")
async def connect(req: ConnectRequest):
    cid = clean_cid(req.connection_id)
    _register(cid, req.user_id or "", req.user_email or "")
    return {"connection_id": cid, "connected": True, "timestamp": now_iso()}

@app.post("/api/scan")
async def scan(req: ScanRequest):
    """Primary scan endpoint — full AI + static analysis."""
    cid     = clean_cid(req.connection_id)
    package = clean_pkg(req.package)
    manager = req.manager.strip().lower()
    
    _register(cid)
    analysis = await analyze_package(package, manager)

    # Static analysis if snippet provided
    if req.install_snippet:
        static = run_static_analysis(req.install_snippet)
        analysis["risk_score"]  = min(100, analysis["risk_score"] + static["score_boost"])
        analysis["flags"]       = list(set(analysis["flags"] + static["flags"]))
        analysis["status"]      = decide(analysis["risk_score"])
        analysis["static_matches"] = static["matches"]

    entry = _save_log(cid, package, manager, analysis, req.timestamp, req.command or "")

    # Quarantine tracking
    if analysis["status"] == "quarantined":
        quarantine_store.setdefault(cid, []).append({
            "package":   package,
            "manager":   manager,
            "risk_score":analysis["risk_score"],
            "reason":    analysis["reason"],
            "added_at":  now_iso(),
        })

    asyncio.create_task(_fire_webhook(cid, entry))

    return {
        "success":        True,
        "log_id":         entry["id"],
        "package":        package,
        "manager":        manager,
        "risk_score":     analysis["risk_score"],
        "status":         analysis["status"],
        "reason":         analysis["reason"],
        "flags":          analysis.get("flags", []),
        "sources":        analysis.get("sources", []),
        "static_matches": analysis.get("static_matches", []),
        "cached":         analysis.get("cached", False),
        "timestamp":      entry["timestamp"],
    }

@app.post("/api/log")
async def post_log(req: LogRequest):
    """Legacy / SDK log endpoint."""
    cid     = clean_cid(req.connection_id)
    package = clean_pkg(req.package)
    manager = req.manager.strip().lower()
    _register(cid)
    analysis = await analyze_package(package, manager)
    entry = _save_log(cid, package, manager, analysis, req.timestamp, req.command or "")
    asyncio.create_task(_fire_webhook(cid, entry))
    return {
        "success":    True,
        "log_id":     entry["id"],
        "package":    package,
        "status":     analysis["status"],
        "risk_score": analysis["risk_score"],
        "reason":     analysis["reason"],
        "flags":      analysis.get("flags", []),
        "timestamp":  entry["timestamp"],
    }

@app.get("/api/logs")
async def get_logs(connection_id: str, limit: int = 100):
    cid = clean_cid(connection_id)
    
    # Auto-register if not found instead of 404
    if cid not in connections:
        _register(cid)
        print(f"DEBUG: Auto-registered connection: {cid}")
        
    conn_logs = sorted(
        [l for l in logs if l["connection_id"] == cid],
        key=lambda x: x["timestamp"], reverse=True
    )
    
    # Debug print
    print(f"DEBUG: Returning {len(conn_logs)} logs for {cid}")
    
    return {
        "connection_id": cid,
        "logs":          conn_logs[:limit],
        "total":         len(conn_logs),
        "timestamp":     now_iso(),
    }

@app.get("/api/stats")
async def get_stats(connection_id: str):
    cid = clean_cid(connection_id)
    
    # Auto-register if not found
    if cid not in connections:
        _register(cid)
        
    conn_logs = [l for l in logs if l["connection_id"] == cid]
    if not conn_logs:
        return {"connection_id":cid,"total":0,"allowed":0,"blocked":0,"quarantined":0,"avg_risk":0,"top_flags":[]}

    flag_counts: dict[str, int] = {}
    for l in conn_logs:
        for f in l.get("flags", []):
            flag_counts[f] = flag_counts.get(f, 0) + 1

    top_flags = sorted(flag_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "connection_id": cid,
        "total":         len(conn_logs),
        "allowed":       sum(1 for l in conn_logs if l["status"] == "allowed"),
        "blocked":       sum(1 for l in conn_logs if l["status"] == "blocked"),
        "quarantined":   sum(1 for l in conn_logs if l["status"] == "quarantined"),
        "avg_risk":      round(sum(l["risk_score"] for l in conn_logs) / len(conn_logs), 1),
        "top_flags":     [{"flag": f, "count": c} for f, c in top_flags],
    }

@app.get("/api/quarantine")
async def get_quarantine(connection_id: str):
    cid = clean_cid(connection_id)
    return {"connection_id": cid, "quarantined": quarantine_store.get(cid, []), "total": len(quarantine_store.get(cid, []))}

@app.delete("/api/quarantine")
async def release_quarantine(req: QuarantineReleaseRequest):
    cid = clean_cid(req.connection_id)
    q = quarantine_store.get(cid, [])
    removed = [p for p in q if p["package"] == req.package]
    quarantine_store[cid] = [p for p in q if p["package"] != req.package]
    return {"released": len(removed), "package": req.package, "force": req.force}

@app.post("/api/webhook")
async def set_webhook(req: WebhookRequest):
    cid = clean_cid(req.connection_id)
    webhook_urls[cid] = req.webhook_url
    return {"success": True, "webhook_url": req.webhook_url, "connection_id": cid}

@app.get("/api/analyze")
async def analyze_single(package: str, manager: str = "pip"):
    """Quick analysis without logging."""
    name = clean_pkg(package)
    result = await analyze_package(name, manager)
    return result

@app.get("/api/cache/clear")
async def clear_cache(connection_id: str):
    cid = clean_cid(connection_id)
    security_cache.clear()
    return {"cleared": True, "timestamp": now_iso()}

@app.get("/api/connections")
async def list_connections():
    return {"connections": list(connections.values()), "total": len(connections)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
