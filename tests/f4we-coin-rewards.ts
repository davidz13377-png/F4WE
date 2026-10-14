import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { advanceListeningReward, verifiedListeningSeconds } from "../apps/api/src/services/listeningRewards.ts";

assert.deepEqual(advanceListeningReward(0, 59, 60, 5), {
  grants: 0,
  grantedCoins: 0,
  remainingSeconds: 59
});
assert.deepEqual(advanceListeningReward(59, 1, 60, 5), {
  grants: 1,
  grantedCoins: 5,
  remainingSeconds: 0
});
assert.deepEqual(advanceListeningReward(179, 1, 180, 5), {
  grants: 1,
  grantedCoins: 5,
  remainingSeconds: 0
});
assert.deepEqual(advanceListeningReward(170, 20, 180, 5), {
  grants: 1,
  grantedCoins: 5,
  remainingSeconds: 10
});
assert.equal(verifiedListeningSeconds(30, 1_000), 1);
assert.equal(verifiedListeningSeconds(5, 4_999), 5);
assert.equal(verifiedListeningSeconds(600, 601_000), 600);

async function verifySources() {
  const desktop = await readFile(new URL("../desktop-windows/renderer/app.js", import.meta.url), "utf8");
  const mobile = await readFile(new URL("../apps/mobile/src/context/PlayerContext.tsx", import.meta.url), "utf8");
  const musicRoute = await readFile(new URL("../apps/api/src/routes/music.ts", import.meta.url), "utf8");
  const shopRoute = await readFile(new URL("../apps/api/src/routes/shop.ts", import.meta.url), "utf8");

  assert.match(desktop, /presenceUnsubscribers/);
  assert.match(desktop, /disconnectPresence\(\)/);
  assert.match(desktop, /seenCoinEvents/);
  assert.match(desktop, /eventId/);
  assert.match(desktop, /pendingSeconds/);
  assert.match(desktop, /flushRewardHeartbeat/);
  assert.doesNotMatch(desktop, /body:\s*\{\s*seconds:\s*30\s*\}/);
  assert.match(mobile, /pendingMilliseconds/);
  assert.match(mobile, /queueHeartbeat\(true\)/);
  assert.match(musicRoute, /advanceListeningReward/);
  assert.match(musicRoute, /eventId:\s*transaction\?\.id/);
  assert.match(shopRoute, /intervalChanged/);
  assert.match(shopRoute, /rewardSeconds:\s*0/);
}

verifySources().then(() => {
  console.log("PASS: listening rewards use exact played time and emit one deduplicated coin event.");
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
