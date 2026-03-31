#!/usr/bin/env node
'use strict';

const fs            = require('fs');
const path          = require('path');
const https         = require('https');
const http          = require('http');
const readline      = require('readline');
const { spawn, execSync } = require('child_process');

const VERSION      = '4.0.0';
const BACKEND_URL  = process.env.SIGIL_API || 'http://127.0.0.1:8001';
const STATE_DIR    = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.sigil');
const STATE_FILE   = path.join(STATE_DIR, 'config.json');
const SANDBOX_DIR  = path.join(process.cwd(), '.sigil_sandbox');
const LOG_FILE     = path.join(STATE_DIR, 'history.json');

// ─── ANSI colours ─────────────────────────────────────────────────────────────
const C = {
  r: '\x1b[0m',  b: '\x1b[1m',  d: '\x1b[2m',
  orange: '\x1b[38;5;208m', red:    '\x1b[38;5;196m',
  green:  '\x1b[38;5;154m', yellow: '\x1b[38;5;220m',
  blue:   '\x1b[38;5;147m', white:  '\x1b[97m',  grey:  '\x1b[90m',
};

const logo = `
${C.orange}${C.b}  ███████╗██╗ ██████╗ ██╗██╗     ${C.r}
${C.orange}${C.b}  ██╔════╝██║██╔════╝ ██║██║     ${C.r}
${C.orange}${C.b}  ███████╗██║██║  ███╗██║██║     ${C.r}
${C.orange}${C.b}  ╚════██║██║██║   ██║██║██║     ${C.r}
${C.orange}${C.b}  ███████║██║╚██████╔╝██║███████╗${C.r}
${C.orange}${C.b}  ╚══════╝╚═╝ ╚═════╝ ╚═╝╚══════╝${C.r}
${C.grey}  Dependency Execution Firewall v${VERSION}${C.r}
`;

// ─── Utilities ────────────────────────────────────────────────────────────────
const tok = (n=4) => Array.from({length:n},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');
const ensureDir = d => { if (!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); };
const saveState = d => { ensureDir(STATE_DIR); fs.writeFileSync(STATE_FILE, JSON.stringify(d, null, 2)); };
const loadState = () => { try { return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE,'utf-8')) : null; } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(`${C.orange}?${C.r} ${question}`, ans => {
    rl.close();
    resolve(ans.toLowerCase());
  }));
}

function appendHistory(entry) {
  ensureDir(STATE_DIR);
  let hist = [];
  try { hist = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE,'utf-8')) : []; } catch {}
  hist.unshift({ ...entry, recorded_at: new Date().toISOString() });
  fs.writeFileSync(LOG_FILE, JSON.stringify(hist.slice(0, 500), null, 2));
}

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data   = JSON.stringify(body);
    const urlObj = new URL(BACKEND_URL + urlPath);
    const lib    = urlObj.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: urlObj.hostname,
      port:     urlObj.port,
      path:     urlObj.pathname,
      method:   'POST',
      headers:  { 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}

async function spinner(msg, fn) {
  const fr = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  let i = 0;
  const iv = setInterval(() => process.stdout.write(`\r${C.orange}${fr[i++%fr.length]}${C.r}  ${msg}   `), 80);
  const r = await fn();
  clearInterval(iv);
  process.stdout.write('\r' + ' '.repeat(msg.length + 10) + '\r');
  return r;
}

// ─── Real install ─────────────────────────────────────────────────────────────
function runInstall(pkg, manager, sandbox=false) {
  return new Promise(resolve => {
    let cmd, args;

    if (sandbox) {
      ensureDir(SANDBOX_DIR);
      if (manager === 'npm' || manager === 'yarn' || manager === 'pnpm') {
        cmd  = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        args = ['install', pkg, '--prefix', SANDBOX_DIR];
      } else {
        cmd  = process.platform === 'win32' ? 'pip' : 'pip3';
        args = ['install', pkg, '--target', SANDBOX_DIR, '--quiet'];
      }
      console.log(`\n${C.yellow}${'─'.repeat(52)}${C.r}`);
      console.log(`${C.yellow}${C.b}  ⚠  SANDBOX INSTALL — ${pkg}${C.r}`);
      console.log(`${C.grey}  Location: ${SANDBOX_DIR}${C.r}`);
      console.log(`${C.yellow}${'─'.repeat(52)}${C.r}\n`);
    } else {
      if (manager === 'npm') {
        cmd  = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        args = ['install', pkg];
      } else if (manager === 'yarn') {
        cmd  = process.platform === 'win32' ? 'yarn.cmd' : 'yarn';
        args = ['add', pkg];
      } else if (manager === 'pnpm') {
        cmd  = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
        args = ['add', pkg];
      } else {
        cmd  = process.platform === 'win32' ? 'pip' : 'pip3';
        args = ['install', pkg];
      }
      console.log(`\n${C.orange}${'─'.repeat(52)}${C.r}`);
      console.log(`${C.orange}${C.b}  ↓ INSTALLING ${pkg} via ${manager.toUpperCase()}${C.r}`);
      console.log(`${C.orange}${'─'.repeat(52)}${C.r}\n`);
    }

    const proc = spawn(cmd, args, { stdio: ['ignore','pipe','pipe'], shell: process.platform === 'win32' });

    proc.stdout.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (!line.trim()) return;
        const col = /success|installed/i.test(line) ? C.green :
                    /warn|warning/i.test(line)       ? C.yellow :
                    /error|failed/i.test(line)        ? C.red :
                    /download|collect|fetch/i.test(line) ? C.blue : C.grey;
        process.stdout.write(`  ${col}${line}${C.r}\n`);
      });
    });
    proc.stderr.on('data', chunk => {
      chunk.toString().split('\n').forEach(line => {
        if (line.trim()) process.stdout.write(`  ${/error/i.test(line)?C.red:C.grey}${line}${C.r}\n`);
      });
    });

    proc.on('close', code => {
      console.log(`\n${C.orange}${'─'.repeat(52)}${C.r}`);
      resolve(code);
    });
    proc.on('error', err => {
      console.log(`\n${C.red}  ✗ Could not run ${cmd}: ${err.message}${C.r}`);
      resolve(1);
    });
  });
}

// ─── Commands ──────────────────────────────────────────────────────────────────
async function cmdInit(flags) {
  console.log(logo);
  const existing = loadState();
  if (existing?.connectionId && !flags.includes('--reset')) {
    console.log(`${C.yellow}⚠  Already initialised.${C.r}`);
    console.log(`   Connection ID: ${C.orange}${C.b}${existing.connectionId}${C.r}\n`);
    console.log(`${C.grey}   Run: ${C.white}sigil init --reset${C.grey} to generate a new ID${C.r}\n`);
    return;
  }

  if (flags.includes('--reset') && fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);

  const connectionId = `SIGIL-${tok()}-${tok()}`;
  try {
    await spinner('Registering with SIGIL backend…', () =>
      post('/api/connect', { connection_id: connectionId })
    );
  } catch {
    console.log(`${C.yellow}⚡ Backend offline — ID saved locally${C.r}`);
  }

  saveState({ connectionId, version: VERSION, initializedAt: new Date().toISOString() });

  console.log(`${C.green}${C.b}✓ SIGIL v${VERSION} initialised${C.r}\n`);
  console.log(`  Connection ID  ${C.orange}${C.b}${connectionId}${C.r}`);
  console.log(`  Config         ${C.grey}${STATE_FILE}${C.r}`);
  console.log(`  Sandbox dir    ${C.grey}${SANDBOX_DIR}${C.r}\n`);
  console.log(`${C.white}Next steps:${C.r}`);
  console.log(`  1. Open SIGIL dashboard → http://localhost:3000`);
  console.log(`  2. Enter Connection ID: ${C.orange}${connectionId}${C.r}`);
  console.log(`  3. Run: ${C.orange}sigil install <package>${C.r}\n`);
}

async function cmdInstall(pkg, manager, flags) {
  if (!pkg) {
    console.error(`${C.red}✗ Usage: sigil install <package> [--pip|--npm|--yarn|--pnpm]${C.r}`);
    process.exitCode = 1; return;
  }

  const state = loadState();
  if (!state?.connectionId) {
    console.error(`${C.red}✗ Not initialised. Run: sigil init${C.r}`);
    process.exitCode = 1; return;
  }

  console.log(`\n${C.orange}${C.b}SIGIL${C.r} ${C.white}Security Analysis${C.r}`);
  console.log(`${C.grey}${'─'.repeat(44)}${C.r}`);
  console.log(`  Package   ${C.white}${pkg}${C.r}`);
  console.log(`  Manager   ${C.blue}${manager}${C.r}`);
  console.log(`  SDK ID    ${C.grey}${state.connectionId}${C.r}\n`);

  let result;
  try {
    result = await spinner(`Scanning ${pkg}…`, async () => {
      await sleep(300 + Math.random() * 500);
      return post('/api/scan', {
        connection_id: state.connectionId,
        package:       pkg,
        manager,
        timestamp:     new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error(`${C.red}✗ Backend unreachable: ${err.message}${C.r}`);
    console.error(`  ${C.grey}Start backend: uvicorn main:app --reload${C.r}\n`);
    process.exitCode = 1; return;
  }

  if (result.status !== 200) {
    // Fallback to /api/log
    try { result = await post('/api/log', { connection_id: state.connectionId, package: pkg, manager, timestamp: new Date().toISOString() }); }
    catch { console.error(`${C.red}✗ Backend error ${result.status}${C.r}`); process.exitCode = 1; return; }
  }

  if (result.status !== 200) {
    console.error(`${C.yellow}⚠ Backend scan skipped: ${result.body?.detail || 'Unexpected response'}${C.r}`);
    console.log(`${C.grey}  Falling back to direct execution...${C.r}\n`);
    return await executeDirect(fullCommand);
  }

  const { status, risk_score, reason, flags: threatFlags = [] } = result.body;

  // Print risk bar
  const barLen = 34;
  const filled = Math.round((risk_score / 100) * barLen);
  const bc = risk_score >= 75 ? C.red : risk_score >= 45 ? C.yellow : C.green;
  const bar = bc + '█'.repeat(filled) + C.grey + '░'.repeat(barLen - filled) + C.r;
  const icon = status==='allowed' ? `${C.green}${C.b}✓ ALLOWED${C.r}` :
               status==='blocked' ? `${C.red}${C.b}✗ BLOCKED${C.r}` :
                                    `${C.yellow}${C.b}⚠ QUARANTINED${C.r}`;

  console.log(`  Risk Score  [${bar}] ${bc}${C.b}${risk_score}/100${C.r}`);
  console.log(`  Decision    ${icon}`);
  console.log(`  Reason      ${C.grey}${reason}${C.r}`);

  if (threatFlags.length) {
    console.log(`  Flags       ${C.yellow}${threatFlags.slice(0,3).join(', ')}${C.r}`);
  }
  console.log(`\n${C.grey}  ↳ Logged to SIGIL dashboard${C.r}`);

  // Record locally
  appendHistory({ package: pkg, manager, status, risk_score, reason, connectionId: state.connectionId });

  // ── Execute decision ──────────────────────────────────────────────────────
  if (status === 'blocked') {
    console.log(`\n${C.red}${'═'.repeat(52)}${C.r}`);
    console.log(`${C.red}${C.b}  ⛔  INSTALLATION BLOCKED — EXECUTION PREVENTED${C.r}`);
    console.log(`${C.red}${'═'.repeat(52)}${C.r}`);
    console.log(`\n  ${C.red}${pkg}${C.r} scored ${C.red}${C.b}${risk_score}/100${C.r} — above block threshold (75).`);
    console.log(`  ${C.grey}${reason}${C.r}`);
    if (threatFlags.length) console.log(`  ${C.yellow}Threats: ${threatFlags.join(', ')}${C.r}`);
    console.log(`\n  ${C.white}No files were installed on your system.${C.r}\n`);
    process.exitCode = 1; return;
  }

  if (status === 'quarantined') {
    console.log(`\n${C.yellow}${'═'.repeat(52)}${C.r}`);
    console.log(`${C.yellow}${C.b}  ⚠  QUARANTINE MODE — SANDBOX INSTALL${C.r}`);
    console.log(`${C.yellow}${'═'.repeat(52)}${C.r}`);
    console.log(`\n  ${C.yellow}${pkg}${C.r} flagged as suspicious (score: ${C.yellow}${risk_score}${C.r}).`);
    console.log(`  ${C.grey}Installing into isolated sandbox — not affecting your project.${C.r}\n`);
    const exitCode = await runInstall(pkg, manager, true /* sandbox */);
    if (exitCode === 0) {
      console.log(`\n${C.yellow}${C.b}  ⚠  ${pkg} installed in sandbox at .sigil_sandbox/${C.r}`);
      console.log(`  ${C.grey}Review before using in your project. Risk: ${risk_score}/100${C.r}\n`);
    }
    return;
  }

  // ALLOWED — real install
  console.log(`\n${C.green}${C.b}  ✓ Cleared — executing real installation${C.r}\n`);
  const exitCode = await runInstall(pkg, manager, false);

  if (exitCode === 0) {
    console.log(`\n${C.green}${C.b}  ✓ ${pkg} installed successfully (risk: ${risk_score}/100)${C.r}\n`);
  } else {
    console.log(`\n${C.yellow}  ⚠  Installation exited ${exitCode} — check output above${C.r}\n`);
  }
}

async function cmdStatus() {
  const state = loadState();
  if (!state?.connectionId) { console.log(`${C.yellow}Not initialised. Run: sigil init${C.r}`); return; }

  console.log(`\n${C.orange}${C.b}SIGIL Status${C.r}`);
  console.log(`  Version        ${C.orange}v${VERSION}${C.r}`);
  console.log(`  Connection ID  ${C.orange}${state.connectionId}${C.r}`);
  console.log(`  Initialised    ${C.grey}${state.initializedAt}${C.r}`);
  console.log(`  Backend        ${C.grey}${BACKEND_URL}${C.r}`);
  console.log(`  Config         ${C.grey}${STATE_FILE}${C.r}`);
  console.log(`  Sandbox        ${C.grey}${SANDBOX_DIR}${C.r}`);

  // Ping backend
  try {
    const r = await post('/health', {});
    console.log(`  Backend health ${C.green}✓ online${C.r} (logs: ${r.body?.total_logs ?? '?'})`);
  } catch {
    console.log(`  Backend health ${C.red}✗ offline${C.r}`);
  }
  console.log();
}

async function cmdHistory() {
  let hist = [];
  try { hist = fs.existsSync(LOG_FILE) ? JSON.parse(fs.readFileSync(LOG_FILE,'utf-8')) : []; } catch {}

  if (!hist.length) { console.log(`${C.grey}No scan history yet.${C.r}`); return; }

  console.log(`\n${C.orange}${C.b}Scan History (last ${Math.min(hist.length, 20)})${C.r}\n`);
  hist.slice(0,20).forEach(h => {
    const c = h.status==='allowed'?C.green:h.status==='blocked'?C.red:C.yellow;
    const icon = h.status==='allowed'?'✓':h.status==='blocked'?'✗':'⚠';
    const pkgName = (h.package || 'unknown').padEnd(22);
    console.log(`  ${c}${icon}${C.r}  ${C.white}${pkgName}${C.r} ${c}${String(h.risk_score).padStart(3)}/100${C.r}  ${C.grey}${(h.manager || 'run').padEnd(4)}  ${new Date(h.recorded_at).toLocaleString()}${C.r}`);
  });
  console.log();
}

async function cmdRun(fullCommand) {
  if (!fullCommand) {
    console.error(`${C.red}✗ Usage: sigil run "command to execute"${C.r}`);
    process.exitCode = 1; return;
  }

  const state = loadState();
  if (!state?.connectionId) {
    console.error(`${C.red}✗ Not initialised. Run: sigil init${C.r}`);
    process.exitCode = 1; return;
  }

  // 1. Parsing
  let manager = 'unknown';
  let pkg = 'unknown';
  const parts = fullCommand.trim().split(/\s+/);
  
  if (parts.length >= 1) manager = parts[0];
  
  // Basic heuristics for package name extraction
  if (manager === 'npm' || manager === 'yarn' || manager === 'pnpm') {
    const idx = parts.findIndex(p => p === 'install' || p === 'add' || p === 'i');
    if (idx !== -1 && parts[idx+1]) pkg = parts[idx+1].replace(/^-+/, '');
  } else if (manager === 'pip' || manager === 'pip3') {
    const idx = parts.findIndex(p => p === 'install');
    if (idx !== -1 && parts[idx+1]) pkg = parts[idx+1].replace(/^-+/, '');
  } else if (manager === 'apt' || manager === 'apt-get') {
    const idx = parts.findIndex(p => p === 'install');
    if (idx !== -1 && parts[idx+1]) pkg = parts[idx+1].replace(/^-+/, '');
  } else if (parts.length > 1) {
    // Fallback: take the last non-flag argument as potential package
    const nonFlags = parts.filter(p => !p.startsWith('-'));
    if (nonFlags.length > 1) pkg = nonFlags[nonFlags.length - 1];
  }

  console.log(`\n${C.orange}${C.b}SIGIL${C.r} ${C.white}Universal Wrapper${C.r}`);
  console.log(`${C.grey}${'─'.repeat(44)}${C.r}`);
  console.log(`  Command   ${C.white}${fullCommand}${C.r}`);
  console.log(`  Package   ${C.white}${pkg}${C.r}`);
  console.log(`  Manager   ${C.blue}${manager}${C.r}`);
  console.log(`  SDK ID    ${C.grey}${state.connectionId}${C.r}\n`);

  // 2. Analysis
  let result;
  try {
    result = await spinner(`Analyzing ${pkg}…`, async () => {
      await sleep(300 + Math.random() * 500);
      return post('/api/scan', {
        connection_id: state.connectionId,
        package:       pkg === 'unknown' ? fullCommand.split(' ')[0] : pkg,
        manager:       manager,
        command:       fullCommand,
        timestamp:     new Date().toISOString(),
      });
    });
  } catch (err) {
    console.error(`${C.red}✗ Backend unreachable: ${err.message}${C.r}`);
    console.log(`${C.yellow}⚠ Falling back to direct execution...${C.r}\n`);
    return await executeDirect(fullCommand);
  }

  const { status, risk_score, reason, flags: threatFlags = [] } = result.body;

  // 3. Execution Control
  const icon = status==='allowed' ? `${C.green}${C.b}✓ ALLOWED${C.r}` :
               status==='blocked' ? `${C.red}${C.b}✗ BLOCKED${C.r}` :
                                    `${C.yellow}${C.b}⚠ RISK DETECTED${C.r}`;

  console.log(`  Risk Score  ${C.b}${risk_score}/100${C.r}`);
  console.log(`  Decision    ${icon}`);
  console.log(`  Reason      ${C.grey}${reason}${C.r}\n`);

  appendHistory({ package: pkg, manager, status, risk_score, reason, command: fullCommand, connectionId: state.connectionId });

  if (risk_score >= 90) {
    console.log(`${C.red}${C.b}⛔ CRITICAL RISK — Execution prevented.${C.r}`);
    process.exitCode = 1; return;
  }

  if (risk_score >= 75) {
    const ans = await ask(`High risk detected. Proceed anyway? (y/N): `);
    if (ans !== 'y') {
      console.log(`${C.grey}Execution cancelled by user.${C.r}`);
      return;
    }
  } else if (risk_score >= 45) {
    console.log(`${C.yellow}⚠ Warning: Moderate risk score. Proceeding in 2s...${C.r}`);
    await sleep(2000);
  }

  await executeDirect(fullCommand);
}

async function executeDirect(cmdLine) {
  return new Promise(resolve => {
    const parts = cmdLine.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    
    console.log(`${C.grey}Executing: ${cmdLine}${C.r}\n`);
    const proc = spawn(cmd, args, { stdio: 'inherit', shell: true });
    
    proc.on('close', code => {
      if (code === 0) console.log(`\n${C.green}✓ Command completed successfully.${C.r}\n`);
      else console.log(`\n${C.yellow}⚠ Command exited with code ${code}.${C.r}\n`);
      resolve(code);
    });
    
    proc.on('error', err => {
      console.error(`\n${C.red}✗ Failed to start command: ${err.message}${C.r}\n`);
      resolve(1);
    });
  });
}

async function cmdQuarantine() {
  const state = loadState();
  if (!state?.connectionId) { console.log(`${C.yellow}Not initialised.${C.r}`); return; }

  try {
    const url = new URL(BACKEND_URL + `/api/quarantine?connection_id=${state.connectionId}`);
    const r = await new Promise((resolve, reject) => {
      const lib = url.protocol==='https:' ? https : http;
      lib.get(url.toString(), res => {
        let raw=''; res.on('data',c=>raw+=c); res.on('end',()=>resolve(JSON.parse(raw)));
      }).on('error', reject);
    });
    const q = r.quarantined || [];
    if (!q.length) { console.log(`\n${C.grey}  No packages in quarantine.${C.r}\n`); return; }
    console.log(`\n${C.yellow}${C.b}Quarantined Packages (${q.length})${C.r}\n`);
    q.forEach(p => {
      console.log(`  ${C.yellow}⚠${C.r}  ${C.white}${p.package.padEnd(22)}${C.r} ${C.yellow}${String(p.risk_score).padStart(3)}/100${C.r}  ${C.grey}${p.manager}  ${p.reason}${C.r}`);
    });
    console.log(`\n  ${C.grey}Review at: ${SANDBOX_DIR}${C.r}\n`);
  } catch { console.log(`${C.red}Could not fetch quarantine — is backend running?${C.r}`); }
}

function cmdHelp() {
  console.log(logo);
  console.log(`${C.white}${C.b}Usage:${C.r}  sigil <command> [options]\n`);
  console.log(`${C.white}Commands:${C.r}`);
  console.log(`  ${C.orange}init${C.r}                    Generate a connection ID`);
  console.log(`    ${C.grey}--reset${C.r}               Delete existing and generate new`);
  console.log(`  ${C.orange}install <pkg>${C.r}           Scan & install a package`);
  console.log(`    ${C.grey}--npm${C.r}                 Use npm`);
  console.log(`    ${C.grey}--yarn${C.r}                Use yarn`);
  console.log(`    ${C.grey}--pnpm${C.r}                Use pnpm`);
  console.log(`    ${C.grey}--pip${C.r}                 Use pip (default)`);
  console.log(`  ${C.orange}run "<cmd>"${C.r}             Universal wrapper for ANY command`);
  console.log(`  ${C.orange}status${C.r}                  Show SDK + backend status`);
  console.log(`  ${C.orange}history${C.r}                 Show local scan history`);
  console.log(`  ${C.orange}quarantine${C.r}              List quarantined packages`);
  console.log(`  ${C.orange}help${C.r}                    Show this help\n`);
  console.log(`${C.white}Examples:${C.r}`);
  console.log(`  ${C.grey}sigil init`);
  console.log(`  sigil install pandas`);
  console.log(`  sigil install express --npm`);
  console.log(`  sigil run "pip install requests"`);
  console.log(`  sigil run "apt install curl"`);
  console.log(`  sigil install crypto-stealer     # → BLOCKED, not installed`);
  console.log(`  sigil install requestx           # → QUARANTINED → sandbox`);
  console.log(`  sigil history`);
  console.log(`  sigil quarantine${C.r}\n`);
  console.log(`${C.white}Decision Engine:${C.r}`);
  console.log(`  ${C.green}✓ ALLOWED${C.r}     Risk 0–44  — real install runs`);
  console.log(`  ${C.yellow}⚠ QUARANTINED${C.r} Risk 45–74 — sandbox install`);
  console.log(`  ${C.red}✗ BLOCKED${C.r}     Risk 75+   — nothing installed\n`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args       = process.argv.slice(2);
  const cmd        = args[0];
  const flags      = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));
  const manager    = flags.includes('--npm') ? 'npm' :
                     flags.includes('--yarn')? 'yarn':
                     flags.includes('--pnpm')? 'pnpm': 'pip';

  switch (cmd) {
    case 'init':       await cmdInit(flags);                       break;
    case 'install':    await cmdInstall(positional[1], manager, flags); break;
    case 'run':        await cmdRun(positional[1]);                break;
    case 'status':     await cmdStatus();                          break;
    case 'history':    await cmdHistory();                         break;
    case 'quarantine': await cmdQuarantine();                      break;
    case undefined:
    case 'help': case '--help': case '-h': cmdHelp(); break;
    default:
      console.error(`${C.red}✗ Unknown command: ${cmd}${C.r}`);
      cmdHelp(); process.exitCode = 1;
  }
}

main().catch(err => { console.error(`${C.red}Fatal: ${err.message}${C.r}`); process.exitCode = 1; });
