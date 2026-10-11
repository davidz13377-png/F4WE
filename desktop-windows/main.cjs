const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const APP_VERSION = "1.3.0";
const API_URL = (process.env.F4WE_API_URL || "https://f4we-api-production.up.railway.app").replace(/\/+$/, "");
let authToken = "";
let mainWindow;

protocol.registerSchemesAsPrivileged([{ scheme: "f4we-media", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

function requestHeaders(extra = {}) {
  return { "X-F4WE-Version": APP_VERSION, ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...extra };
}

async function apiRequest({ route, method = "GET", body, headers = {} }) {
  if (typeof route !== "string" || !route.startsWith("/")) throw new Error("Invalid API route");
  const response = await net.fetch(`${API_URL}${route}`, {
    method,
    headers: requestHeaders({ ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...headers }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: response.ok, status: response.status, data };
}

function mimeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  return ({ ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".lrc": "text/plain", ".txt": "text/plain" })[extension] || "application/octet-stream";
}

async function pickAndUpload(options) {
  const image = options.accept === "image";
  const audio = options.accept === "audio";
  const result = await dialog.showOpenDialog(mainWindow, {
    title: options.title || (image ? "Choose image" : audio ? "Choose MP3" : "Choose file"),
    properties: ["openFile"],
    filters: image
      ? [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }]
      : audio ? [{ name: "MP3 audio", extensions: ["mp3"] }] : [{ name: "Files", extensions: ["*"] }]
  });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const contentType = mimeFor(filePath);
  const file = await fs.readFile(filePath);
  const setup = await apiRequest({ route: options.startPath, method: "POST", body: { ...(options.startPayload || {}), mimeType: contentType, size: file.byteLength } });
  if (!setup.ok) return setup;
  const uploaded = await net.fetch(setup.data.uploadUrl, { method: "PUT", headers: { "Content-Type": setup.data.contentType }, body: file });
  if (!uploaded.ok) return { ok: false, status: uploaded.status, data: { error: `Storage upload failed (HTTP ${uploaded.status})` } };
  return apiRequest({ route: options.completePath, method: "POST", body: { uploadToken: setup.data.uploadToken, ...(options.completePayload || {}) } });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1580,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#05080b",
    frame: false,
    show: false,
    icon: path.join(__dirname, "resources", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    if (process.env.F4WE_SCREENSHOT_PATH) setTimeout(async () => {
      const capture = await mainWindow.webContents.capturePage();
      await fs.writeFile(process.env.F4WE_SCREENSHOT_PATH, capture.toPNG());
      app.quit();
    }, 1_200);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId("com.musicbox.desktop");
  protocol.handle("f4we-media", async request => {
    if (!authToken) return new Response("Authentication required", { status: 401 });
    const url = new URL(request.url);
    const musicId = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (url.hostname !== "music" || !musicId || musicId.length > 100) return new Response("Invalid media URL", { status: 400 });
    const range = request.headers.get("range");
    return net.fetch(`${API_URL}/api/music/${encodeURIComponent(musicId)}/stream`, {
      headers: requestHeaders(range ? { Range: range } : {})
    });
  });

  ipcMain.handle("app:config", () => ({ apiUrl: API_URL, version: APP_VERSION, platform: process.platform }));
  ipcMain.handle("auth:set-token", (_event, token) => { authToken = typeof token === "string" ? token : ""; return true; });
  ipcMain.handle("api:request", (_event, options) => apiRequest(options));
  ipcMain.handle("upload:pick", (_event, options) => pickAndUpload(options));
  ipcMain.handle("window:control", (_event, action) => {
    if (!mainWindow) return;
    if (action === "minimize") mainWindow.minimize();
    if (action === "maximize") mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    if (action === "close") mainWindow.close();
  });
  ipcMain.handle("shell:open", (_event, url) => /^https:\/\//i.test(url) ? shell.openExternal(url) : false);
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
