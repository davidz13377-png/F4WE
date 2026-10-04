const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const schema = read("apps/api/prisma/schema.prisma");
for (const contract of ["cachedTrackCount", "cachedDuration", "normalizedTitle", "releaseDate", "model PlaylistCollaborator", "model PushToken"]) {
  assert.ok(schema.includes(contract), `Missing database contract: ${contract}`);
}

const migration = read("apps/api/prisma/migrations/20261004000000_platform_update/migration.sql");
for (const contract of ["cachedTrackCount", "releaseDate", "PlaylistCollaborator", "PushToken", "app.minimum_version", "app.maintenance_enabled"]) {
  assert.ok(migration.includes(contract), `Missing migration contract: ${contract}`);
}

const identitySource = read("apps/api/src/services/musicIdentity.ts");
const identityJs = ts.transpileModule(identitySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const identityModule = { exports: {} };
vm.runInNewContext(identityJs, { module: identityModule, exports: identityModule.exports });
const canonical = identityModule.exports.musicIdentity;
assert.deepEqual({ ...canonical("Álom (Official Video) feat. Guest", "MANUÉL") }, { ...canonical("Alom", "manuel") });
assert.notEqual(canonical("Same title", "Artist A").normalizedArtist, canonical("Same title", "Artist B").normalizedArtist);

const playlists = read("apps/api/src/routes/playlists.ts");
assert.ok(playlists.includes("cachedTrackCount") && playlists.includes("cachedDuration"), "Playlist summaries are not cached");
for (const endpoint of ['router.put("/:id/order"', 'router.post("/:id/collaborators"', 'router.delete("/:id/collaborators/:userId"']) {
  assert.ok(playlists.includes(endpoint), `Missing playlist endpoint: ${endpoint}`);
}
const playlistScreen = read("apps/mobile/app/playlist/[id].tsx");
assert.equal((playlistScreen.match(/playlist\.songs\.map\(song => <SongRow/g) || []).length, 1, "Playlist songs must render exactly once");
assert.ok(playlistScreen.includes("<ScrollView") && playlistScreen.includes("Save order"), "Long playlist ordering is not scrollable/saveable");

const music = read("apps/api/src/routes/music.ts");
for (const contract of ['router.get("/:id/info"', 'router.post("/:id/cut"', "pg_advisory_xact_lock", "releaseDateInput"]) {
  assert.ok(music.includes(contract), `Missing music contract: ${contract}`);
}
const lyrics = read("apps/mobile/src/components/MiniPlayer.tsx");
assert.ok(lyrics.includes("onPress={() => void player.seek(line.time)}"), "Timed lyric lines do not seek playback");

const shop = read("apps/api/src/routes/shop.ts");
assert.ok(shop.includes('access: { used: false }') && shop.includes('router.post("/transfer"'), "Used invites or friend coin transfer are incomplete");
const shopScreen = read("apps/mobile/app/profile/shop.tsx");
assert.ok(shopScreen.includes("F4WE COIN calculator") && shopScreen.includes(" F4WE COIN</Text>"), "Shop label/calculator is incomplete");

const system = read("apps/api/src/routes/system.ts"), gate = read("apps/mobile/src/components/AppGate.tsx"), guard = read("apps/api/src/middleware/systemGuard.ts");
assert.ok(system.includes("announceUpdate") && system.includes("maintenanceEnabled") && system.includes("createBroadcastNotification"), "Owner update/maintenance controls are incomplete");
assert.ok(gate.includes("onRequestClose={() => undefined}") && gate.includes("https://f4we.xyz") === false && gate.includes("Linking.openURL"), "Blocking update gate is incomplete");
assert.ok(guard.includes("APP_UPDATE_REQUIRED") && guard.includes("MAINTENANCE"), "Server-side update/maintenance enforcement is incomplete");

const notificationService = read("apps/api/src/services/notifications.ts"), pushClient = read("apps/mobile/src/components/PushRegistration.tsx");
assert.ok(notificationService.includes("https://exp.host/--/api/v2/push/send") && pushClient.includes("requestPermissionsAsync") && pushClient.includes("getExpoPushTokenAsync"), "Push notifications are incomplete");

const developer = read("apps/api/src/routes/developer.ts"), friends = read("apps/api/src/routes/friends.ts"), owner = read("apps/mobile/app/profile/owner.tsx");
assert.ok(developer.includes('/users/:id/app-id') && developer.includes('/staff-stats'), "Owner ID editing or staff stats are missing");
assert.ok(friends.includes('/charts') && owner.includes("Publish required update") && owner.includes("Maintenance break"), "Friend charts or Owner controls are missing");

const appJson = JSON.parse(read("apps/mobile/app.json"));
assert.equal(appJson.expo.version, "1.1.0");
assert.equal(appJson.expo.android.versionCode, 2);
assert.ok(appJson.expo.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === "expo-notifications"));
assert.ok(fs.statSync(path.join(root, "apps/mobile/assets/F4WE-icon.png")).size > 10_000, "New F4WE app icon is missing");

console.log("PASS: cached playlists, canonical duplicates, release dates, reorder/collaboration, forced updates, maintenance, push, coins, charts, audio cuts and song info are wired.");
