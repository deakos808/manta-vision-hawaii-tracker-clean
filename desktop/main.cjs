// Adapted from Diver Ops Tracker's owned-Vite Electron lifecycle.
const { app, BrowserWindow, dialog, Menu } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const NAME = 'MantaTracker Development';
const ROOT = '/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-development';
const URL = 'http://127.0.0.1:8081';
const CANONICAL = 'https://apweteosdbgsolmvcmhn.supabase.co';
app.setName(NAME);
app.setPath('userData', path.join(app.getPath('appData'), NAME));
let window, child, stopping, quitting = false, listening = false;
const logDir = path.join(app.getPath('appData'), NAME, 'logs');
function log(message) {
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, 'desktop.log'), `${new Date().toISOString()} ${message}\n`);
}
function environment() {
  if (!fs.existsSync(path.join(ROOT, '.git')) || !fs.existsSync(path.join(ROOT, 'package.json'))) {
    throw Error('Canonical development worktree is unavailable.');
  }
  const local = require(path.join(ROOT, 'node_modules/dotenv')).parse(fs.readFileSync(path.join(ROOT, '.env.local')));
  if (local.VITE_SUPABASE_URL !== CANONICAL || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(local.VITE_SUPABASE_PUBLISHABLE_KEY || '')) {
    throw Error('.env.local requires the canonical Supabase URL and a normal publishable key.');
  }
  // Vite also validates all effective env files before opening its listener.
  const env = { ...process.env, MANTA_DEV_PORT: '8081' };
  for (const [name, value] of Object.entries({ ...local, ...env })) {
    if (!name.startsWith('VITE_') || !value) continue;
    let serviceRole = false;
    try { serviceRole = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch {}
    if (/SECRET|SERVICE_ROLE/.test(name) || value.includes('sb_secret_') || serviceRole) {
      throw Error('Privileged browser credentials are prohibited.');
    }
  }
  for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SECRET_KEYS', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SECRET_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_EDGE_URL']) delete env[name];
  env.PATH = `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${env.PATH || ''}`;
  return env;
}
function freePort() {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port: 8081, exclusive: true }, () => server.close(() => resolve(true)));
  });
}
async function waitReady() {
  const deadline = Date.now() + 60000;
  while (!quitting && Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw Error('Owned Vite server exited before startup.');
    if (!listening) { await new Promise(resolve => setTimeout(resolve, 100)); continue; }
    const ready = await new Promise(resolve => {
      const request = http.get(URL, response => { response.resume(); resolve(response.statusCode === 200); });
      request.setTimeout(1000, () => request.destroy());
      request.on('error', () => resolve(false));
    });
    if (ready && child.exitCode === null && child.signalCode === null) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error('Development server startup was canceled or timed out.');
}
function stopOwnedVite() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    log(`Stopping owned Vite process group ${child.pid}`);
    try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; return; }
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {}
        resolve();
      }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    log('Owned Vite stopped');
  })();
  return stopping;
}
function focus() {
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus(); app.focus({ steal: true });
  log('Focused existing window');
}
async function start() {
  const env = environment();
  if (!await freePort()) throw Error('Port 8081 is occupied. This app will not adopt or stop an unknown server.');
  if (quitting) return;
  child = spawn('/usr/bin/arch', ['-arm64', '/usr/bin/env', 'node', path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '8081', '--strictPort'], {
    cwd: ROOT, env, detached: true, stdio: ['ignore', 'pipe', 'ignore'],
  });
  log(`Started owned Vite process group ${child.pid}`);
  // Require the owned child to announce its listener before trusting HTTP readiness.
  let output = '';
  child.stdout.on('data', chunk => {
    output = (output + chunk.toString()).slice(-4096);
    if (output.includes('http://127.0.0.1:8081/')) listening = true;
  });
  child.on('error', () => fail(Error('Unable to start the owned Vite process.')));
  child.on('exit', () => { if (window && !quitting) void fail(Error('The owned Vite server stopped unexpectedly.')); });
  await waitReady();
  if (quitting) return;
  window = new BrowserWindow({ width: 1440, height: 960, minWidth: 360, minHeight: 620, title: NAME, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (new global.URL(url).origin !== URL) event.preventDefault(); });
  window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(NAME); });
  window.once('ready-to-show', focus);
  window.on('closed', () => { window = null; app.quit(); });
  // Let the existing protected route restore auth, rather than showing the public sign-in CTA.
  await window.loadURL(`${URL}/dashboard`);
  log('Standalone window loaded');
}
async function fail(error) {
  if (quitting) return;
  log('Startup/runtime failure');
  await stopOwnedVite();
  dialog.showErrorBox(NAME, error.message);
  app.quit();
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focus);
  app.on('activate', focus);
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault(); quitting = true;
    void stopOwnedVite().finally(() => app.quit());
  });
  app.whenReady().then(() => {
    app.setActivationPolicy('regular');
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: NAME, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
      { role: 'editMenu' }, { role: 'windowMenu', submenu: [
        { role: 'minimize' }, { role: 'zoom' }, { type: 'separator' },
        ...[[390, 844], [393, 852], [430, 932], [1440, 960]].map(([width, height]) => ({
          label: `Content ${width} × ${height}`, click: () => { window?.setContentSize(width, height); window?.center(); },
        })),
      ] },
    ]));
    return start();
  }).catch(fail);
  process.on('SIGTERM', () => app.quit());
  process.on('SIGINT', () => app.quit());
}
