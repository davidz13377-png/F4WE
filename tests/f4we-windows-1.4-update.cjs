const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");
const renderer = read("desktop-windows/renderer/app.js");
const main = read("desktop-windows/main.cjs");
const preload = read("desktop-windows/preload.cjs");
const routes = read("apps/api/src/routes/artists.ts");
const css = read("desktop-windows/renderer/styles.css");
const shop = read("apps/api/src/routes/shop.ts");
const mobilePlayer = read("apps/mobile/src/context/PlayerContext.tsx");

assert.match(renderer, /`f4we\.recent\.\$\{state\.user\.id\}`/);
assert.doesNotMatch(renderer, /localStorage\.(?:getItem|setItem)\("f4we\.recent"/);
assert.match(renderer, /const requestId = \+\+state\.playbackRequest/);
assert.match(renderer, /error\?\.name === "AbortError"/);
assert.match(renderer, /Edit artist/);
assert.match(renderer, /Edit album/);
assert.match(renderer, /artist-hero-bg/);
assert.match(renderer, /\/api\/artists\/manage\/songs/);
assert.match(renderer, /Search by song or artist/);
assert.match(renderer, /This app is Owned By notxenom1/);
assert.match(renderer, /mediaControls\?\.onAction/);
assert.match(renderer, /presenceCleanup/);
assert.match(routes, /router\.get\("\/manage\/songs", staff/);
assert.match(routes, /artistId: z\.string\(\).*optional\(\)/);
assert.match(routes, /heroUrl/);
assert.match(main, /setThumbarButtons/);
for (const action of ["like", "previous", "toggle", "next"]) assert.match(main, new RegExp(`"${action}"`));
assert.match(preload, /media:update/);
assert.match(preload, /media:action/);
assert.match(css, /artist-hero-bg/);
assert.match(shop, /rewardSeconds: 0/);
assert.match(mobilePlayer, /rewardClock/);

for (const name of ["heart", "previous", "play", "pause", "next"]) {
  const file = path.join(root, "desktop-windows", "resources", "taskbar", `${name}.png`);
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 50, `${name} taskbar icon is missing`);
}

console.log("PASS: Windows 1.4 account history, catalog editing, artist banners, full track search, stable playback and taskbar controls are wired.");
