const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("headless");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("ozone-platform", "headless");
const viewport = { width: 1600, height: 900 };
app.commandLine.appendSwitch("window-size", `${viewport.width},${viewport.height}`);

const root = path.resolve(__dirname, "..");
const output = process.env.F4WE_AVATAR_OUTPUT || path.join(root, "avatar-visual-test.png");
const picturePath = process.env.F4WE_AVATAR_PICTURE || path.join(root, "desktop-windows", "renderer", "assets", "f4we-icon.png");
const framePath = process.env.F4WE_AVATAR_FRAME;

function dataUri(filePath) {
  const bytes = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();
  const type = extension === ".gif" ? "image/gif" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/png";
  return `data:${type};base64,${bytes.toString("base64")}`;
}

const fallbackFrame = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="82" fill="none" stroke="#7b2cff" stroke-width="25"/><path d="M24 59 45 65 53 42 67 70M133 31l9 26 24-9-18 22M31 136l25-4 3 25 15-23M133 165l12-26 24 13-30 3" fill="none" stroke="#f2e8ff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`)}`;
const picture = dataUri(picturePath);
const frame = framePath ? dataUri(framePath) : fallbackFrame;
const productionCss = fs.readFileSync(path.join(root, "desktop-windows", "renderer", "styles.css"), "utf8");

function profileAvatar(size, status = null) {
  return `<span class="profile-avatar profile-avatar-${size} has-frame"><img class="avatar-base" src="${picture}"><img class="avatar-frame" src="${frame}">${status === null ? "" : `<i class="presence-dot ${status ? "" : "offline"}"></i>`}</span>`;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>${productionCss}
html,body{height:auto;overflow:visible;background:#050506}.fixture{width:1600px;min-height:900px;display:grid;grid-template-columns:225px 1fr 306px;background:linear-gradient(135deg,#050506,#141416);color:#fff}.fixture-sidebar{padding:24px 18px;border-right:1px solid #29292d;display:flex;flex-direction:column}.fixture-brand{font-size:25px;font-weight:900;letter-spacing:.16em}.fixture-nav{margin-top:34px;color:#818188;line-height:3;font-size:12px}.fixture-sidebar .sidebar-user{margin-top:auto;padding-top:15px}.fixture-main{padding:54px 31px}.fixture-main .profile-hero{min-height:250px;margin:0}.fixture-main .profile-info{align-items:center}.fixture-main .profile-info h1{margin:7px 0}.fixture-main .surface{margin-top:18px;display:flex;align-items:center;gap:50px}.fixture-main .surface>div{display:flex;align-items:center;gap:14px}.fixture-main .surface strong{font-size:11px}.fixture .friends-panel{grid-column:auto;grid-row:auto;position:static;padding:27px 21px}.fixture .friend-activity{grid-template-columns:51px 1fr;gap:10px}.fixture .friend-activity p{max-width:155px}.fixture .sidebar-user img{background:transparent}.fixture img{user-select:none}</style></head><body><main class="fixture"><aside class="fixture-sidebar"><div class="fixture-brand">F4WE</div><div class="fixture-nav">Home<br>Search<br>Your Library<br>Playlists<br>Liked Songs<br>Friends<br>Activity</div><div class="sidebar-user"><span class="chrome-avatar has-frame"><img src="${picture}"><img class="avatar-frame" src="${frame}"></span><div><strong>notxenom1</strong><small>OWNER</small></div></div></aside><section class="fixture-main"><section class="profile-hero"><div class="profile-info">${profileAvatar("hero")}<div><p class="section-kicker">F4WE PROFILE</p><h1>Karma</h1><p><span class="rank-chip">DEVELOPER</span> · ID 67</p></div></div></section><div class="surface"><div>${profileAvatar("large")}<strong>Search profile · 68px</strong></div><div>${profileAvatar("medium")}<strong>Friend card · 46px</strong></div><div class="unframed-fixture"><span class="chrome-avatar"><img src="${picture}"><img class="avatar-frame hidden" alt=""></span><strong>No design · 34px</strong></div></div></section><aside class="friends-panel"><div class="panel-title"><div><p>FRIENDS ACTIVITY</p><h2>Listening Now</h2></div></div><div class="friends-activity"><div class="friend-activity">${profileAvatar("small", false)}<div class="friend-copy"><strong>Karma</strong><p>Offline</p></div></div><div class="friend-activity">${profileAvatar("small", true)}<div class="friend-copy"><strong>notxenom1</strong><p>Listening now</p></div></div></div><button class="account-pill"><span class="chrome-avatar has-frame"><img src="${picture}"><img class="avatar-frame" src="${frame}"></span><span>notxenom1</span></button></aside></main></body></html>`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({ ...viewport, show: false, webPreferences: { offscreen: true, sandbox: false } });
  let paintedFrame = null;
  window.webContents.setFrameRate(30);
  window.webContents.on("paint", (_event, _dirty, image) => {
    if (!image.isEmpty() && image.getSize().width > 1) paintedFrame = image;
  });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  window.setContentSize(viewport.width, viewport.height);
  window.webContents.invalidate();
  await new Promise(resolve => setTimeout(resolve, 500));
  const geometry = await window.webContents.executeJavaScript(`(() => [...document.querySelectorAll('.profile-avatar.has-frame,.chrome-avatar.has-frame')].map(node => {
    const base = node.querySelector(':scope > img:first-child,.avatar-base');
    const frame = node.querySelector('.avatar-frame');
    const a = node.getBoundingClientRect(), b = base.getBoundingClientRect(), f = frame.getBoundingClientRect();
    return { wrapper:[a.width,a.height], base:[b.width,b.height], frame:[f.width,f.height], centerDelta:[Math.round((b.left+b.width/2)-(a.left+a.width/2)),Math.round((b.top+b.height/2)-(a.top+a.height/2))], layers:[getComputedStyle(base).zIndex,getComputedStyle(frame).zIndex], frameTransform:getComputedStyle(frame).transform };
  }))()`);
  for (const item of geometry) {
    if (item.wrapper[0] <= 1 || item.wrapper[1] <= 1) throw new Error(`Avatar is not visible: ${JSON.stringify(item)}`);
    if (item.centerDelta[0] !== 0 || item.centerDelta[1] !== 0) throw new Error(`Avatar is not centred: ${JSON.stringify(item)}`);
    if (Number(item.layers[1]) <= Number(item.layers[0])) throw new Error(`Frame is not above portrait: ${JSON.stringify(item)}`);
    if (item.frameTransform !== "none") throw new Error(`Frame has an unexpected transform: ${JSON.stringify(item)}`);
    if (Math.abs(item.wrapper[0] - item.frame[0]) > 0.1 || Math.abs(item.wrapper[1] - item.frame[1]) > 0.1) throw new Error(`Frame does not fill wrapper: ${JSON.stringify(item)}`);
  }
  const unframed = await window.webContents.executeJavaScript(`(() => {
    const wrapper = document.querySelector('.unframed-fixture .chrome-avatar');
    const base = wrapper.querySelector(':scope > img:first-child');
    const frame = wrapper.querySelector('.avatar-frame');
    const a = wrapper.getBoundingClientRect(), b = base.getBoundingClientRect(), f = frame.getBoundingClientRect();
    return { wrapper:[a.width,a.height], base:[b.width,b.height], frame:[f.width,f.height], frameDisplay:getComputedStyle(frame).display, frameSource:frame.getAttribute('src'), centerDelta:[Math.round((b.left+b.width/2)-(a.left+a.width/2)),Math.round((b.top+b.height/2)-(a.top+a.height/2))] };
  })()`);
  if (unframed.frameDisplay !== "none" || unframed.frameSource !== null || unframed.frame[0] !== 0 || unframed.frame[1] !== 0) throw new Error(`Removed frame is still visible: ${JSON.stringify(unframed)}`);
  if (unframed.centerDelta[0] !== 0 || unframed.centerDelta[1] !== 0) throw new Error(`Unframed avatar is not centred: ${JSON.stringify(unframed)}`);
  const captured = paintedFrame || await window.webContents.capturePage({ x: 0, y: 0, ...viewport });
  if (captured.isEmpty() || captured.getSize().width <= 1) throw new Error("Electron did not produce a usable visual-test frame");
  fs.writeFileSync(output, captured.toPNG());
  process.stdout.write(`${JSON.stringify({ output, geometry, unframed }, null, 2)}\n`);
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
