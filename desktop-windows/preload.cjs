const { clipboard, contextBridge, ipcRenderer } = require("electron");
const { io } = require("socket.io-client");

let socket = null;
const listeners = new Map();

contextBridge.exposeInMainWorld("f4we", {
  config: () => ipcRenderer.invoke("app:config"),
  setToken: token => ipcRenderer.invoke("auth:set-token", token),
  request: (route, options = {}) => ipcRenderer.invoke("api:request", { route, ...options }),
  pickAndUpload: options => ipcRenderer.invoke("upload:pick", options),
  windowControl: action => ipcRenderer.invoke("window:control", action),
  openExternal: url => ipcRenderer.invoke("shell:open", url),
  copyText: value => clipboard.writeText(String(value)),
  presence: {
    connect(apiUrl, token) {
      if (socket) socket.disconnect();
      socket = io(apiUrl, { auth: { token }, transports: ["websocket", "polling"] });
      for (const [event, callbacks] of listeners) for (const callback of callbacks) socket.on(event, callback);
    },
    disconnect() { socket?.disconnect(); socket = null; },
    emit(event, ...args) { socket?.emit(event, ...args); },
    on(event, callback) {
      const callbacks = listeners.get(event) || new Set();
      callbacks.add(callback); listeners.set(event, callbacks); socket?.on(event, callback);
      return () => { callbacks.delete(callback); socket?.off(event, callback); };
    }
  }
});
