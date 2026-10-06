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
const storage = read("apps/api/src/services/storage.ts"), cutSelector = read("apps/mobile/src/components/CutRangeSelector.tsx"), manager = read("apps/mobile/app/profile/music-manager.tsx");
assert.ok(storage.includes('spawn("ffprobe"') && storage.includes('"-t", String(requestedDuration)') && !storage.includes('"-to", String(endSeconds)'), "Audio cutting must use accurate duration-based FFmpeg output and FFprobe validation");
assert.ok(cutSelector.includes("PanResponder") && cutSelector.includes("Play selected range") && manager.includes("<CutRangeSelector"), "The mobile two-handle cut preview is incomplete");
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
assert.ok(
  guard.includes("nativeMediaStream") && guard.includes("!nativeMediaStream && olderThan"),
  "Version-less native media requests must bypass only the update-version check"
);
const playerContext = read("apps/mobile/src/context/PlayerContext.tsx");
assert.ok(
  playerContext.includes('import { API_URL, APP_VERSION, api, currentToken }') &&
  playerContext.includes('"X-F4WE-Version": APP_VERSION'),
  "Native music stream requests must include the app version or the update guard returns HTTP 426"
);

const notificationService = read("apps/api/src/services/notifications.ts"), pushClient = read("apps/mobile/src/components/PushRegistration.tsx");
assert.ok(notificationService.includes("https://exp.host/--/api/v2/push/send") && pushClient.includes("requestPermissionsAsync") && pushClient.includes("getExpoPushTokenAsync"), "Push notifications are incomplete");

const developer = read("apps/api/src/routes/developer.ts"), friends = read("apps/api/src/routes/friends.ts"), owner = read("apps/mobile/app/profile/owner.tsx");
assert.ok(developer.includes('/users/:id/app-id') && developer.includes('/staff-stats'), "Owner ID editing or staff stats are missing");
assert.ok(friends.includes('/charts') && owner.includes("Publish required update") && owner.includes("Maintenance break"), "Friend charts or Owner controls are missing");
const flexibleIdMigration = read("apps/api/prisma/migrations/20261005000000_flexible_user_ids/migration.sql");
assert.ok(schema.includes("@db.VarChar(32)") && !schema.includes("@db.Char(16)"), "User IDs are still fixed to 16 characters");
assert.ok(flexibleIdMigration.includes('ALTER TABLE "User" ALTER COLUMN "id" TYPE VARCHAR(32)') && developer.includes("/^\\d{1,16}$/"), "Flexible 1-16 digit App IDs are incomplete");

const picker = read("apps/mobile/src/components/PlaylistPicker.tsx"), notifications = read("apps/mobile/app/profile/notifications.tsx"), profile = read("apps/api/src/routes/profile.ts");
assert.ok(picker.includes("/api/playlists?library=true") && picker.includes("item.canEdit"), "Collaborators cannot choose shared playlists when adding songs");
assert.ok(!music.includes("listening_reward") && !music.includes("F4WE COIN earned"), "Listening rewards must not create user notifications");
assert.ok(profile.includes('router.delete("/notifications"') && profile.includes('router.delete("/notifications/:id"') && notifications.includes("Delete all") && notifications.includes("trash-outline"), "Notification deletion is incomplete");
assert.ok(profile.includes('/staff/requests/active-count') && read("apps/mobile/app/(tabs)/profile.tsx").includes("activeRequestCount"), "Active request count is missing from staff profiles");
assert.ok(schema.includes("sessionVersion") && developer.includes('/users/:id/password') && owner.includes("Reset User Password"), "Owner password reset or session invalidation is incomplete");
const share = read("apps/api/src/routes/share.ts");
assert.ok(share.includes('property="og:title"') && share.includes("musicbox://playlist/") && share.includes("f4we.xyz") && playlistScreen.includes("Share playlist"), "Playlist rich preview or app deep link is incomplete");

const appJson = JSON.parse(read("apps/mobile/app.json"));
assert.equal(appJson.expo.version, "1.2.0");
assert.equal(appJson.expo.android.versionCode, 3);
assert.ok(read("apps/mobile/android/app/build.gradle").includes('versionName "1.2.0"') && read("apps/mobile/android/app/build.gradle").includes("versionCode 3"), "Native Android version does not match app.json");
assert.equal(appJson.expo.android.googleServicesFile, "./google-services.json");
assert.ok(appJson.expo.plugins.some(plugin => Array.isArray(plugin) && plugin[0] === "expo-notifications"));
const notificationPlugin = appJson.expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-notifications");
assert.equal(notificationPlugin[1].color, "#000000", "Notification icon background must match the black F4WE theme");
assert.ok(read("apps/mobile/android/app/src/main/res/values/colors.xml").includes('<color name="notification_icon_color">#000000</color>'), "Native notification icon color is not black");
assert.ok(fs.statSync(path.join(root, "apps/mobile/assets/F4WE-icon.png")).size > 10_000, "New F4WE app icon is missing");
const firebaseConfig = JSON.parse(read("apps/mobile/google-services.json"));
const nativeFirebaseConfig = JSON.parse(read("apps/mobile/android/app/google-services.json"));
const firebasePackage = firebaseConfig.client?.[0]?.client_info?.android_client_info?.package_name;
const nativeFirebasePackage = nativeFirebaseConfig.client?.[0]?.client_info?.android_client_info?.package_name;
assert.equal(firebasePackage, "com.musicbox.app", "Firebase package does not match the Android app");
assert.equal(nativeFirebasePackage, firebasePackage, "Native Firebase config is not synced from the Expo config");
assert.ok(read("apps/mobile/android/build.gradle").includes("com.google.gms:google-services"), "Google Services Gradle plugin is missing");
assert.ok(read("apps/mobile/android/app/build.gradle").includes("apply plugin: 'com.google.gms.google-services'"), "Google Services app plugin is missing");

const discordNative = read("apps/mobile/android/app/src/main/cpp/discord_presence.cpp");
const discordCmake = read("apps/mobile/android/app/src/main/jni/CMakeLists.txt");
const androidBuild = read("apps/mobile/android/app/build.gradle");
const discordModule = read("apps/mobile/android/app/src/main/java/com/musicbox/app/discord/DiscordPresenceModule.kt");
const discordBridge = read("apps/mobile/src/lib/discordPresence.ts");
assert.ok(
  discordNative.includes("Discord_Client_UpdateRichPresence") &&
  discordNative.includes("Discord_ActivityTypes_Playing") &&
  discordNative.includes("Try F4WE") &&
  discordNative.includes("https://f4we.xyz/"),
  "Discord listening activity is incomplete"
);
assert.ok(discordModule.includes("1550247896803446874L") && discordBridge.includes("updateActivity"), "Discord Application ID or React Native bridge is missing");
assert.ok(
  discordModule.includes("private fun ensureInitialized()") &&
  discordModule.includes("reactApplicationContext.currentActivity") &&
  !discordModule.includes("private fun initialize()"),
  "Discord native module is not compatible with React Native 0.86"
);
assert.ok(read("apps/mobile/src/context/PlayerContext.tsx").includes("updateDiscordActivity") && read("apps/mobile/src/playerService.ts").includes("PlaybackQueueEnded"), "Discord activity is not connected to foreground and background playback");
assert.ok(
  androidBuild.includes('path file("src/main/jni/CMakeLists.txt")') &&
  discordCmake.includes("ReactNative-application.cmake") &&
  discordCmake.includes("discord_partner_sdk::discord_partner_sdk") &&
  discordCmake.includes("discord_presence.cpp"),
  "React Native or Discord native CMake configuration is missing"
);
assert.ok(fs.statSync(path.join(root, "apps/mobile/android/app/libs/discord_partner_sdk.aar")).size > 20_000_000, "Discord Android SDK is missing");

console.log("PASS: playlists, collaboration, sharing, notifications, password reset, flexible IDs, rewards, updates, Firebase push, Discord activity, cuts and song info are wired.");
