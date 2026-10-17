const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

const mobileConfig = JSON.parse(read("apps/mobile/app.json"));
const desktopPackage = JSON.parse(read("desktop-windows/package.json"));
assert.equal(mobileConfig.expo.version, "1.3.0");
assert.equal(mobileConfig.expo.android.versionCode, 4);
assert.equal(desktopPackage.version, "1.5.0");

const schema = read("apps/api/prisma/schema.prisma");
const migration = read("apps/api/prisma/migrations/20261017000000_platform_maintenance_announcements/migration.sql");
for (const model of ["OwnerAnnouncement", "OwnerAnnouncementDismissal"]) {
  assert.match(schema, new RegExp(`model ${model} \\{`), `Missing ${model} Prisma model`);
  assert.match(migration, new RegExp(`CREATE TABLE "${model}"`), `Missing ${model} migration`);
}
assert.match(schema, /platforms\s+String\[\]/);
assert.match(migration, /"platforms" TEXT\[\]/);

const system = read("apps/api/src/routes/system.ts");
for (const contract of ["app.maintenance_android", "app.maintenance_windows", "maintenancePlatforms", "maintenanceApplies"]) {
  assert.ok(system.includes(contract), `Missing system contract: ${contract}`);
}
assert.match(system, /router\.post\("\/announcements", authenticate/);
assert.match(system, /router\.get\("\/announcements\/pending", authenticate/);
assert.match(system, /router\.post\("\/announcements\/:id\/dismiss", authenticate/);
assert.match(system, /createdBy: \{ select: \{ username: true \} \}/);

const guard = read("apps/api/src/middleware/systemGuard.ts");
assert.match(guard, /x-f4we-platform/);
assert.match(guard, /platform === "android" \? value\.maintenanceAndroid/);
assert.match(guard, /platform === "windows" \? value\.maintenanceWindows/);

const mobileApi = read("apps/mobile/src/lib/api.ts");
const mobileStream = read("apps/mobile/src/context/PlayerContext.tsx");
assert.match(mobileApi, /"X-F4WE-Platform": "android"/);
assert.match(mobileStream, /"X-F4WE-Platform": "android"/);

const gate = read("apps/mobile/src/components/AppGate.tsx");
const announcementGate = read("apps/mobile/src/components/OwnerAnnouncementGate.tsx");
const mobileLayout = read("apps/mobile/app/_layout.tsx");
const owner = read("apps/mobile/app/profile/owner.tsx");
assert.match(gate, /maintenanceApplies/);
assert.match(announcementGate, /F4WE MESSAGE/);
assert.match(announcementGate, /by \{current\.by\}/);
assert.match(announcementGate, /announcements\/\$\{encodeURIComponent\(current\.id\)\}\/dismiss/);
assert.match(mobileLayout, /<OwnerAnnouncementGate \/>/);
assert.match(owner, /Notification Send/);
assert.match(owner, /Windows 10\/11/);
assert.match(owner, /maintenancePlatforms: \{ android: maintenanceAndroid, windows: maintenanceWindows \}/);

const desktopMain = read("desktop-windows/main.cjs");
const desktop = read("desktop-windows/renderer/app.js");
assert.match(desktopMain, /"X-F4WE-Platform": "windows"/);
assert.match(desktop, /function showMaintenance/);
assert.match(desktop, /maintenanceApplies/);
assert.match(desktop, /function loadOwnerAnnouncements/);
assert.match(desktop, /by \$\{safe\(announcement\.by\)\}/);
assert.match(desktop, /id="owner-announcement-form"/);
assert.match(desktop, /name="maintenanceAndroid"/);
assert.match(desktop, /name="maintenanceWindows"/);
for (const feature of ["Music requests", "Bug reports", "Ideas", "music-request-form", "bug-form", "idea-form"]) {
  assert.ok(desktop.includes(feature), `Windows activity is missing ${feature}`);
}
for (const action of ["data-delete-request", "data-delete-bug", "data-delete-idea"]) {
  assert.ok(desktop.includes(action), `Windows submission deletion is missing ${action}`);
}

console.log("PASS: platform maintenance, owner announcements and Windows request/report/idea flows are wired.");
