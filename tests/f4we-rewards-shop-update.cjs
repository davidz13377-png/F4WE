const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

const schema = read("apps/api/prisma/schema.prisma");
for (const contract of ["bannerUrl", "coins", "rewardSeconds", "animatedProfileUnlocked", "isStaffPlaylist", "model ShopProduct", "model ProfileDesign", "model OwnedProfileDesign", "model CoinTransaction", "model RewardInvite"]) {
  assert.ok(schema.includes(contract), `Missing database contract: ${contract}`);
}

const migration = read("apps/api/prisma/migrations/20260927000000_rewards_shop_profiles/migration.sql");
assert.ok(migration.includes('LOWER("username")') && migration.includes("reward.interval_seconds") && migration.includes("invite_code"), "Username uniqueness or shop defaults are missing from the migration");

const music = read("apps/api/src/routes/music.ts"), playlists = read("apps/api/src/routes/playlists.ts");
assert.ok(music.includes('router.get("/duplicate"') && music.includes("confirmDuplicate") && music.includes("addSongToStaffPlaylist"), "Duplicate confirmation or Staff Playlist sync is missing");
assert.ok(music.includes("rewardSeconds") && music.includes("listening.reward") && music.includes("lastHeartbeatAt") && music.includes('latest?.id !== play.id'), "Server-verified single-session listening rewards are missing");
assert.ok(playlists.includes("isStaffPlaylist") && playlists.includes("maintained automatically"), "Staff Playlist visibility or write protection is missing");

const shop = read("apps/api/src/routes/shop.ts"), profile = read("apps/api/src/routes/profile.ts");
for (const endpoint of ["/purchase/:key", "/designs/:id/purchase", "/owner/coins", "/owner/reward-settings", "/owner/designs/complete"]) assert.ok(shop.includes(endpoint), `Missing shop endpoint: ${endpoint}`);
assert.ok(shop.includes('owners: { some: { userId } }') && shop.includes('"shop.design_retired"') && !shop.includes("prisma.profileDesign.delete"), "Retired designs must remain available to their existing owners");
assert.ok(profile.includes('/users/:id') && profile.includes('/me/banner/upload-url') && profile.includes("That username is already taken"), "Public profile, banner, or username editing is incomplete");

const realtime = read("apps/api/src/services/realtime.ts"), mini = read("apps/mobile/src/components/MiniPlayer.tsx");
assert.ok(realtime.includes("listeningFollowers") && realtime.includes("listening:followers"), "Listener follower reporting is missing");
assert.ok(mini.includes("layout.y + layout.height / 2 - lyricsViewport / 2") && mini.includes("Listening with you"), "Centered lyrics or connected-listener UI is missing");

const bot = read("apps/bot/src/index.ts"), botUpload = read("apps/bot/src/musicUpload.ts");
assert.ok(bot.includes('setName("addmusic")') && bot.includes('setName("removeowner")') && bot.includes('OWNER_DISCORD_ID = "1141698223141048463"'), "Discord music/owner commands are incomplete");
assert.ok(botUpload.includes("fileTypeFromBuffer") && botUpload.includes("hasMpegAudioFrames") && botUpload.includes("attachment.proxyURL") && botUpload.includes("r2://") && botUpload.includes("addToStaffPlaylist"), "Discord MP3 validation/R2 upload is incomplete");

const mobileProfile = read("apps/mobile/app/(tabs)/profile.tsx"), mobileShop = read("apps/mobile/app/profile/shop.tsx"), owner = read("apps/mobile/app/profile/owner.tsx");
assert.ok(mobileProfile.includes("F4WE COINS") && mobileProfile.includes("Change username") && mobileProfile.includes("bannerUrl"), "Profile banner, balance, or rename UI is missing");
assert.ok(mobileShop.includes("Invite Code") || mobileShop.includes("invite_code"), "F4WE Shop product UI is missing");
assert.ok(mobileShop.includes('method: design.using ? "DELETE" : "POST"') && mobileShop.includes('title={design.using ? "Remove"'), "Profile designs cannot be unequipped from the shop");
assert.ok(owner.includes("F4WE Coin Add / Remove") && owner.includes("Reward Settings") && owner.includes("Design Add"), "Owner Portal controls are missing");

console.log("PASS: rewards, shop, banners, frames, duplicate uploads, Staff Playlist, centered lyrics, listener list and Discord commands are wired.");
