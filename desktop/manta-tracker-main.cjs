const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PROJECT_DIR = process.env.MANTA_PROJECT_DIR || "/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean";
const FRONTEND_HOST = "127.0.0.1";
const FRONTEND_PORT = 8080;
const MATCHER_PORT = 8766;
const FRONTEND_URL = `http://${FRONTEND_HOST}:${FRONTEND_PORT}/`;
const LOG_DIR = path.join(PROJECT_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "launcher.log");
const APP_ICON = process.env.MANTA_ICON || "";

app.setName("Manta Tracker");
app.setPath("userData", path.join(app.getPath("appData"), "Manta Tracker Local"));

fs.mkdirSync(LOG_DIR, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });

let mainWindow = null;
let quitConfirmed = false;
let confirmationOpen = false;
let shutdownPromise = null;
const ownedChildren = new Map();

function log(message) {
  const line = `[${new Date().toISOString()}] [electron] ${message}\n`;
  logStream.write(line);
}

function appendChildOutput(label, chunk) {
  for (const line of String(chunk).split(/\r?\n/)) {
    if (line) log(`[${label}] ${line}`);
  }
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: FRONTEND_HOST, port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

function waitForPort(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: FRONTEND_HOST, port });
      socket.setTimeout(1500);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      const retry = () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`Timed out waiting for port ${port}`));
        else setTimeout(attempt, 500);
      };
      socket.once("error", retry);
      socket.once("timeout", retry);
    };
    attempt();
  });
}

function waitForHttp(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 500) resolve();
        else retry();
      });
      request.setTimeout(2000);
      request.once("timeout", () => {
        request.destroy();
        retry();
      });
      request.once("error", retry);
    };
    const retry = () => {
      if (Date.now() >= deadline) reject(new Error(`Timed out waiting for ${url}`));
      else setTimeout(attempt, 500);
    };
    attempt();
  });
}

function startOwnedProcess(label, command) {
  log(`Starting ${label}: ${command}`);
  const child = spawn("/usr/bin/arch", ["-arm64", "/bin/zsh", "-lic", command], {
    cwd: PROJECT_DIR,
    detached: true,
    env: { ...process.env, MANTA_ELECTRON_WRAPPER: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const record = { label, child, pid: child.pid, exited: false };
  ownedChildren.set(label, record);
  child.stdout.on("data", (chunk) => appendChildOutput(label, chunk));
  child.stderr.on("data", (chunk) => appendChildOutput(label, chunk));
  child.once("error", (error) => log(`${label} failed to spawn: ${error.stack || error.message}`));
  child.once("exit", (code, signal) => {
    record.exited = true;
    log(`${label} exited with code=${code} signal=${signal}`);
  });
  return record;
}

function waitForChildExit(record, timeoutMs) {
  if (record.exited || record.child.exitCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    record.child.once("exit", () => finish(true));
  });
}

async function stopOwnedProcess(record) {
  if (!record || record.exited || record.child.exitCode !== null || !record.pid) return;
  log(`Stopping owned ${record.label} process group ${record.pid} with SIGTERM.`);
  try {
    process.kill(-record.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") log(`Could not stop ${record.label}: ${error.message}`);
    return;
  }

  if (await waitForChildExit(record, 5000)) return;
  log(`Owned ${record.label} process group ${record.pid} did not exit; sending SIGKILL.`);
  try {
    process.kill(-record.pid, "SIGKILL");
  } catch (error) {
    if (error.code !== "ESRCH") log(`Could not force-stop ${record.label}: ${error.message}`);
  }
  await waitForChildExit(record, 2000);
}

function stopOwnedProcesses() {
  if (!shutdownPromise) {
    shutdownPromise = Promise.all([...ownedChildren.values()].map(stopOwnedProcess)).then(() => {
      log("Owned local server shutdown completed.");
    });
  }
  return shutdownPromise;
}

async function showStartupFailure(message, detail) {
  log(`Startup failure: ${message}${detail ? ` — ${detail}` : ""}`);
  await stopOwnedProcesses();
  await shell.openPath(LOG_DIR);
  await dialog.showMessageBox({
    type: "error",
    title: "Manta Tracker Startup Failed",
    message,
    detail: `${detail || "See launcher.log for details."}\n\nLogs: ${LOG_FILE}`,
    buttons: ["OK"],
  });
  quitConfirmed = true;
  app.quit();
}

async function confirmQuit() {
  if (confirmationOpen || quitConfirmed) return;
  confirmationOpen = true;
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: "question",
    title: "Quit Manta Tracker",
    message: "Quit Manta Tracker and stop the local servers?",
    buttons: ["Cancel", "Quit"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  confirmationOpen = false;

  if (result.response === 0) {
    log("User canceled quit; keeping the app and owned servers running.");
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return;
  }

  log("User confirmed quit.");
  quitConfirmed = true;
  await stopOwnedProcesses();
  app.quit();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    title: "Manta Tracker",
    show: false,
    ...(APP_ICON && fs.existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (event) => {
    if (quitConfirmed) return;
    event.preventDefault();
    void confirmQuit();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.loadURL(FRONTEND_URL);
}

async function start() {
  log(`Electron wrapper invoked from ${PROJECT_DIR}.`);

  if (!(await canBindPort(FRONTEND_PORT)) || !(await canBindPort(MATCHER_PORT))) {
    await showStartupFailure(
      "A local Manta server is already running on port 8080 or 8766.",
      "Use Quit Manta Tracker first, then reopen mantatracker.app. The Electron wrapper will not adopt or stop processes it did not start.",
    );
    return;
  }

  startOwnedProcess("vite", "npm run dev -- --host 127.0.0.1 --port 8080");
  startOwnedProcess("matcher", "npm run dev:matcher-api");

  try {
    await Promise.all([waitForHttp(FRONTEND_URL), waitForPort(MATCHER_PORT)]);
  } catch (error) {
    await showStartupFailure("The local Manta servers did not start successfully.", error.message);
    return;
  }

  log("Vite and matcher are ready; opening the Electron window.");
  createWindow();
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on("before-quit", (event) => {
    if (quitConfirmed || !mainWindow) return;
    event.preventDefault();
    void confirmQuit();
  });

  app.on("window-all-closed", () => {
    if (quitConfirmed) app.quit();
  });

  app.whenReady().then(async () => {
    if (process.platform === "darwin" && APP_ICON && fs.existsSync(APP_ICON)) app.dock.setIcon(APP_ICON);
    await start();
  });
}

process.on("uncaughtException", async (error) => {
  log(`Uncaught exception: ${error.stack || error.message}`);
  await showStartupFailure("The Manta Tracker desktop wrapper encountered an unexpected error.", error.message);
});

process.on("unhandledRejection", async (error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  log(`Unhandled rejection: ${detail}`);
  await showStartupFailure("The Manta Tracker desktop wrapper encountered an unexpected error.", detail);
});
