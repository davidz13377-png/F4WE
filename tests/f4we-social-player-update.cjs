const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const schema = read("apps/api/prisma/schema.prisma");
for (const field of ["shareListening", "listenedSeconds", "lyricsSynced", "model FriendRequest", "model Friendship"]) assert.ok(schema.includes(field), `Missing schema contract: ${field}`);

const service = read("apps/mobile/src/playerService.ts"), player = read("apps/mobile/src/context/PlayerContext.tsx");
assert.ok(service.includes("PlaybackActiveTrackChanged") && service.includes("updateNowPlayingMetadata"), "Background notification metadata is not refreshed on track changes");
assert.ok(player.includes("PlaybackActiveTrackChanged") && player.includes("RepeatMode.Track") && player.includes("toggleShuffle"), "Foreground notification/shuffle/repeat contracts are missing");
assert.ok(player.includes("listening:update") && player.includes("listening:join") && player.includes("/play/${encodeURIComponent(playSession.id)}"), "Presence or listening-time heartbeat is missing");

const mini = read("apps/mobile/src/components/MiniPlayer.tsx");
assert.ok(mini.includes("parseLrc") && mini.includes("lyricsScroll") && !mini.includes("styles.volumeSlider"), "Lyrics follow or volume removal is incomplete");

const uploader = read("apps/mobile/app/profile/uploader.tsx"), manager = read("apps/mobile/app/profile/music-manager.tsx");
assert.ok(uploader.includes("launchImageLibraryAsync") && uploader.includes("Timed .lrc") && uploader.includes("Plain .txt"), "Phone artwork / lyrics upload is incomplete");
assert.ok(manager.includes("saveLyrics") && manager.includes("removeLyrics"), "Lyrics cannot be updated later");

const bot = read("apps/bot/src/index.ts"), botLyrics = read("apps/bot/src/lyrics.ts");
assert.ok(bot.includes('setName("szoveg")') && bot.includes("downloadLyricsFile") && bot.includes("lyrics_updated_from_discord"), "Discord lyrics upload command is incomplete");
assert.ok(botLyrics.includes("MAX_LYRICS_BYTES") && botLyrics.includes("TextDecoder") && botLyrics.includes("timedLine"), "Discord lyrics file validation is incomplete");

const friends = read("apps/mobile/app/friends.tsx"), friendRoutes = read("apps/api/src/routes/friends.ts");
assert.ok(friends.includes('type Tab = "friends" | "search" | "requests"') && friends.includes("followUser"), "Friends tabs or listen-together UI is missing");
assert.ok(friendRoutes.includes('/requests/:id/accept') && friendRoutes.includes("prisma.friendship.upsert"), "Friend request acceptance is missing");

const playlists = read("apps/api/src/routes/playlists.ts"), profile = read("apps/api/src/routes/profile.ts");
assert.ok(playlists.includes("Rank.Developer") && playlists.includes("totalDuration"), "Developer private access or playlist duration is missing");
assert.ok(profile.includes("/me/listening-stats") && profile.includes("/me/recap"), "Listening stats or annual recap is missing");

const splash = read("apps/mobile/app/index.tsx");
assert.ok(splash.includes("ASSEMBLING YOUR MUSIC") && splash.includes("glitch"), "Glitch loading screen is missing");
console.log("PASS: notification refresh, listening controls/stats, mobile artwork, lyrics, private playlists, friends sync and glitch splash contracts.");
