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
const html = read("desktop-windows/renderer/index.html");
const shop = read("apps/api/src/routes/shop.ts");
const mobilePlayer = read("apps/mobile/src/context/PlayerContext.tsx");
const musicRoutes = read("apps/api/src/routes/music.ts");

assert.match(renderer, /`f4we\.recent\.\$\{state\.user\.id\}`/);
assert.doesNotMatch(renderer, /localStorage\.(?:getItem|setItem)\("f4we\.recent"/);
assert.match(renderer, /function resetAccountState\(\)/);
assert.match(renderer, /if \(state\.user\?\.id !== result\.user\.id\) resetAccountState\(\)/);
assert.doesNotMatch(renderer, /state\.rotation\.length \? state\.rotation : state\.songs\.slice/);
assert.doesNotMatch(renderer, /recent\.length \? recent : state\.songs\.slice/);
assert.match(musicRoutes, /where: \{ userId: req\.auth!\.userId, playedAt: \{ gte: weekStart \} \}/);
assert.match(renderer, /const requestId = \+\+state\.playbackRequest/);
assert.match(renderer, /error\?\.name === "AbortError"/);
assert.match(renderer, /Edit artist/);
assert.match(renderer, /Edit album/);
assert.match(renderer, /id="delete-artist"/);
assert.match(renderer, /id="delete-release"/);
assert.match(renderer, /\/api\/artists\/\$\{encodeURIComponent\(artist\.id\)\}/);
assert.match(renderer, /\/api\/artists\/releases\/\$\{encodeURIComponent\(release\.id\)\}/);
assert.match(renderer, /artist-hero-bg/);
assert.match(renderer, /\/api\/artists\/manage\/songs/);
assert.match(renderer, /Search by song or artist/);
assert.match(renderer, /This app is Owned By notxenom1/);
assert.match(renderer, /mediaControls\?\.onAction/);
assert.match(renderer, /presenceCleanup/);
assert.match(routes, /router\.get\("\/manage\/songs", staff/);
assert.match(routes, /artistId: z\.string\(\).*optional\(\)/);
assert.match(routes, /heroUrl/);
assert.match(routes, /router\.delete\("\/:id", staff/);
assert.match(routes, /router\.delete\("\/releases\/:releaseId", staff/);
assert.match(routes, /Promise\.allSettled\(\[deleteImage\(artist\.imageUrl/);
assert.match(main, /setThumbarButtons/);
for (const action of ["like", "previous", "toggle", "next"]) assert.match(main, new RegExp(`"${action}"`));
assert.match(preload, /media:update/);
assert.match(preload, /media:action/);
assert.match(css, /artist-hero-bg/);
assert.match(css, /\.app-shell\{position:fixed;inset:0;/);
assert.match(css, /\.title-drag\{[^}]*flex:0 0 225px/);
assert.match(css, /\.topbar\{[^}]*-webkit-app-region:drag/);
assert.match(css, /\.settings-menu button\{height:44px;font-size:13px\}/);
assert.match(css, /\.settings-section h2\{font-size:20px\}/);
assert.match(css, /\.settings-section>p\{font-size:13px/);
assert.match(css, /\.song-main span,\.song-album,\.song-duration\{font-size:11px\}/);
assert.match(css, /\.titlebar\{background:transparent!important;border:0!important\}/);
assert.doesNotMatch(html, /class="title-drag"><img/);
assert.match(shop, /rewardSeconds: 0/);
assert.match(mobilePlayer, /rewardClock/);

for (const name of ["heart", "previous", "play", "pause", "next"]) {
  const file = path.join(root, "desktop-windows", "resources", "taskbar", `${name}.png`);
  assert.ok(fs.existsSync(file) && fs.statSync(file).size > 50, `${name} taskbar icon is missing`);
}

console.log("PASS: Windows 1.4 account history, catalog editing/deletion, merged title bar, artist banners, full track search, stable playback and taskbar controls are wired.");
