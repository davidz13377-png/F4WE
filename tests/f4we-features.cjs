// Local HTTP contract tests with a mock Prisma store; no database or tokens needed.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const ts = require("typescript"), express = require("express");
const root = path.resolve(__dirname, "..");
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : name.endsWith("/F4WEAlert") ? { F4WEAlert: { alert() {} } } : require(name), console, process, URL, Date, Math, Number, Promise, FormData, Blob, setTimeout, clearTimeout, Object, Set, Map });
  return module.exports;
}
const owner = { id: "1111111111111111", username: "owner", rank: "Access" }, other = { id: "2222222222222222", username: "other", rank: "Access" };
const songs = [{ id: "s1", title: "One", artist: "Artist", filePath: "/private/one.mp3", mimeType: "audio/mpeg", uploaderId: owner.id, uploadDate: new Date() }, { id: "s2", title: "Two", filePath: "/private/two.mp3", mimeType: "audio/mpeg", uploaderId: owner.id, uploadDate: new Date() }];
let albums = [], links = [], favorites = [], saved = [], logs = [], ideas = [], requests = [], registered = [], actor = owner, sequence = 0;
const customKey = { key: "abc122", used: false, usedCount: 0, usageLimit: 3, createdByDiscordId: "discord" };
function matches(row, where = {}) {
  if (where.AND && !where.AND.every(w => matches(row, w))) return false;
  if (where.OR && !where.OR.some(w => matches(row, w))) return false;
  for (const key of ["id", "creatorId", "isPublic", "albumId", "musicId", "userId"]) {
    if (where[key] !== undefined && (typeof where[key] === "object" ? !where[key].in.includes(row[key]) : row[key] !== where[key])) return false;
  }
  if (where.name && !row.name.toLowerCase().includes(where.name.contains.toLowerCase())) return false;
  if (where.savedBy && !saved.some(s => s.albumId === row.id && s.userId === where.savedBy.some.userId)) return false;
  return true;
}
function fullAlbum(a, include = {}) {
  if (!a) return null;
  return { ...a, creator: a.creatorId === owner.id ? owner : other, _count: { songs: links.filter(l => l.albumId === a.id).length },
    savedBy: saved.filter(s => s.albumId === a.id && (!include.savedBy?.where || s.userId === include.savedBy.where.userId)),
    songs: links.filter(l => l.albumId === a.id).sort((a, b) => a.order - b.order).map(l => ({ ...l, music: { ...songs.find(s => s.id === l.musicId), favorites: favorites.filter(f => f.musicId === l.musicId && f.userId === actor.id) } })) };
}
const db = {
  album: {
    findMany: async ({ where, include }) => albums.filter(a => matches(a, where)).map(a => fullAlbum(a, include)),
    findFirst: async ({ where, include }) => fullAlbum(albums.find(a => matches(a, where)), include),
    findUnique: async ({ where }) => albums.find(a => a.id === where.id) || null,
    create: async ({ data }) => { const a = { id: "p" + ++sequence, creationDate: new Date(), ...data }; albums.push(a); return fullAlbum(a); },
    update: async ({ where, data }) => { const a = albums.find(a => a.id === where.id); Object.assign(a, data); return a; },
    updateMany: async ({ where, data }) => { const match = albums.filter(a => matches(a, where)); match.forEach(a => Object.assign(a, data)); return { count: match.length }; },
    deleteMany: async ({ where }) => { const ids = albums.filter(a => matches(a, where)).map(a => a.id); albums = albums.filter(a => !ids.includes(a.id)); links = links.filter(l => !ids.includes(l.albumId)); saved = saved.filter(s => !ids.includes(s.albumId)); return { count: ids.length }; }
  },
  albumSong: {
    findUnique: async ({ where }) => links.find(l => matches(l, where.albumId_musicId)) || null,
    count: async ({ where }) => links.filter(l => matches(l, where)).length,
    findFirst: async ({ where }) => links.filter(l => matches(l, where)).sort((a, b) => b.order - a.order)[0] || null,
    create: async ({ data }) => { links.push(data); return data; },
    deleteMany: async ({ where }) => { const old = links.length; links = links.filter(l => !matches(l, where)); return { count: old - links.length }; }
  },
  music: {
    findUnique: async ({ where }) => songs.find(s => s.id === where.id) || null,
    findMany: async ({ where }) => songs.filter(s => !where.id || where.id.in.includes(s.id)).map(s => ({ ...s, favorites: favorites.filter(f => f.musicId === s.id && f.userId === actor.id) })),
    create: async ({ data }) => { const song = { id: "s" + ++sequence, uploadDate: new Date(), mimeType: "audio/mpeg", ...data }; songs.push(song); return song; },
    delete: async ({ where }) => { const index = songs.findIndex(s => s.id === where.id); const [s] = songs.splice(index, 1); links = links.filter(l => l.musicId !== where.id); favorites = favorites.filter(f => f.musicId !== where.id); return s; },
    update: async ({ where, data }) => { const s = songs.find(s => s.id === where.id); Object.assign(s, data); return { ...s, favorites: favorites.filter(f => f.musicId === s.id && f.userId === actor.id) }; }
  },
  favorite: {
    findMany: async ({ where }) => favorites.filter(f => matches(f, where)).map(f => ({ ...f, music: songs.find(s => s.id === f.musicId) })),
    upsert: async ({ create }) => { if (!favorites.some(f => matches(f, create))) favorites.push(create); },
    deleteMany: async ({ where }) => { favorites = favorites.filter(f => !matches(f, where)); }
  },
  savedAlbum: {
    upsert: async ({ create }) => { if (!saved.some(s => matches(s, create))) saved.push(create); },
    deleteMany: async ({ where }) => { saved = saved.filter(s => s.albumId !== where.albumId || (typeof where.userId === "object" ? s.userId === where.userId.not : s.userId !== where.userId)); }
  },
  logEvent: { create: async ({ data }) => logs.push(data) },
  notification: { create: async ({ data }) => ({ id: "n" + ++sequence, ...data }) },
  musicRequest: {
    findMany: async ({ where }) => requests.filter(item => !where || item.userId === where.userId),
    findUnique: async ({ where }) => requests.find(item => item.id === where.id) || null,
    findUniqueOrThrow: async ({ where }) => requests.find(item => item.id === where.id),
    create: async ({ data }) => { const item = { id: "r" + ++sequence, status: "Pending", requestDate: new Date(), ...data }; requests.push(item); return item; },
    updateMany: async ({ where, data }) => { const matches = requests.filter(item => item.id === where.id && (!where.status || item.status === where.status) && (!where.sourceUrl || item.sourceUrl)); matches.forEach(item => Object.assign(item, data)); return { count: matches.length }; },
    deleteMany: async ({ where }) => { const before = requests.length; requests = requests.filter(item => item.id !== where.id || item.userId !== where.userId || item.status === "Processing"); return { count: before - requests.length }; }
  },
  updateIdea: {
    findMany: async ({ where, include }) => ideas.filter(i => !where || i.userId === where.userId).map(i => ({ ...i, ...(include ? { user: i.userId === owner.id ? owner : other } : {}) })),
    create: async ({ data }) => { const item = { id: "i" + ++sequence, createdDate: new Date(), ...data }; ideas.unshift(item); return item; },
    deleteMany: async ({ where }) => { const old = ideas.length; ideas = ideas.filter(i => i.id !== where.id || (where.userId && i.userId !== where.userId)); return { count: old - ideas.length }; }
  },
  accessKey: { findUnique: async ({ where }) => where.key === customKey.key ? customKey : null, update: async ({ data }) => Object.assign(customKey, data) },
  user: { findUnique: async ({ where }) => registered.find(u => u.id === where.id || u.username === where.username) || null, create: async ({ data }) => { const user = { id: data.id, username: data.username, rank: "Access", isOwner: false, profilePicture: null, registrationDate: new Date(), ...data }; registered.push(user); return user; }, findMany: async ({ where, select }) => { assert.deepEqual(where.OR[1].rank.in.join(","), "Moderator,Admin,Developer"); assert.ok(!select.passwordHash); return [{ ...other, rank: "Admin" }]; }, update: async ({ where, data }) => ({ id: where.id, ...data }), updateMany: async ({ where, data }) => { const matches = registered.filter(u => u.id === where.id && (!where.isOwner || !u.isOwner)); matches.forEach(u => Object.assign(u, data)); return { count: matches.length }; }, deleteMany: async ({ where }) => { const count = registered.filter(u => u.id === where.id && !u.isOwner).length; registered = registered.filter(u => u.id !== where.id || u.isOwner); return { count }; }, findUniqueOrThrow: async ({ where }) => registered.find(u => u.id === where.id) || { id: where.id, profilePicture: null } },
  $queryRaw: async () => [], $transaction: async cb => cb(db)
};
const env = { PUBLIC_API_URL: "http://127.0.0.1:4000", MAX_MP3_MB: 25, UPLOAD_DIR: "uploads", JWT_SECRET: "test-secret-that-is-more-than-32-characters" };
const realAuth = load("apps/api/src/middleware/auth.ts", { "../env.js": { env }, "../db.js": { prisma: db } });
const auth = { requireRank: realAuth.requireRank, signToken: realAuth.signToken, authenticate: (req, res, next) => { if (!req.headers.authorization) return res.status(401).json({ error: "Authentication required" }); req.auth = { userId: actor.id, rank: actor.rank, isOwner: !!actor.isOwner }; next(); } };
const errors = load("apps/api/src/middleware/errors.ts", { "../services/logging.js": { audit: async () => {} } });
const catalog = load("apps/api/src/services/catalog.ts", { "../env.js": { env } });
let detector = async () => null;
const storageMock = {
  beginDirectUpload: async (category, userId, contentType, size) => {
    const valid = category === "music" ? contentType === "audio/mpeg" : ["image/jpeg", "image/png", "image/webp"].includes(contentType);
    if (!valid) throw Object.assign(new Error(category === "music" ? "Only valid MP3 files are accepted" : "Use a JPG, PNG, or WebP image"), { status: 415 });
    if (size && size > (category === "music" ? env.MAX_MP3_MB : 5) * 1024 * 1024) throw Object.assign(new Error("The selected file is too large"), { status: 413 });
    return { uploadUrl: `https://r2.test/${category}/direct`, uploadToken: `direct:${category}:${userId}`, contentType, expiresIn: 600 };
  },
  completeDirectUpload: async (category, userId, token) => {
    if (token !== `direct:${category}:${userId}`) throw Object.assign(new Error("The upload session is invalid or expired. Choose the file again."), { status: 400 });
    return category === "music"
      ? { key: "music/direct.mp3", reference: "r2://music/direct.mp3", mimeType: "audio/mpeg", size: 123 }
      : { key: `${category}/direct.png`, url: `${env.PUBLIC_API_URL}/media/${category}/direct.png`, mimeType: "image/png", size: 68 };
  },
  saveImage: async (category, buffer, extension) => {
    const directory = path.resolve(env.UPLOAD_DIR, category); fs.mkdirSync(directory, { recursive: true });
    const filename = `test-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
    fs.writeFileSync(path.join(directory, filename), buffer);
    return `${env.PUBLIC_API_URL}/media/${category}/${filename}`;
  },
  deleteImage: async (value, category) => {
    if (!value) return; const filename = path.basename(new URL(value).pathname);
    try { fs.unlinkSync(path.resolve(env.UPLOAD_DIR, category, filename)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  },
  saveMusic: async buffer => { const value = path.resolve(env.UPLOAD_DIR, `test-${Date.now()}.mp3`); fs.writeFileSync(value, buffer); return value; },
  deleteMusic: async value => { try { fs.unlinkSync(value); } catch {} },
  openMusic: async () => null,
  storedMusicName: value => path.basename(value)
};
const mocks = { "../db.js": { prisma: db }, "../middleware/auth.js": auth, "../middleware/errors.js": errors, "../env.js": { env }, "../services/catalog.js": catalog, "../services/logging.js": { audit: async () => {} }, "../services/realtime.js": { notifyUser: () => {} }, "../services/storage.js": storageMock, "../services/spotify.js": {
  canonicalSpotifyTrackUrl: url => url.protocol === "https:" && url.hostname === "open.spotify.com" && /^\/track\/[A-Za-z0-9]{22}$/.test(url.pathname) ? `https://open.spotify.com${url.pathname}` : null,
  spotifyTrackMetadata: async () => ({ title: "Spotify test track", artworkUrl: "https://i.scdn.co/image/test" })
}, "file-type": { fileTypeFromBuffer: buffer => detector(buffer) } };
const app = express(); app.use(express.json());
app.use("/api/auth", load("apps/api/src/routes/auth.ts", mocks).default);
app.use("/api/playlists", load("apps/api/src/routes/playlists.ts", mocks).default);
app.use("/api/music", load("apps/api/src/routes/music.ts", mocks).default);
app.use("/api/profile", load("apps/api/src/routes/profile.ts", mocks).default);
app.use("/api/developer", load("apps/api/src/routes/developer.ts", mocks).default);
app.use(errors.errorHandler);
let base;
async function request(method, route, body, authorized = true) {
  const response = await fetch(base + route, { method, headers: { "Content-Type": "application/json", ...(authorized ? { Authorization: "Bearer mock" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
async function main() {
  detector = (await import("file-type")).fileTypeFromBuffer;
  const tempDirectory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "f4we-photo-test-"));
  env.UPLOAD_DIR = tempDirectory;
  const server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); base = "http://127.0.0.1:" + server.address().port;
  try {
    for (let index = 1; index <= 3; index++) assert.equal((await request("POST", "/api/auth/register", { username: `keyuser${index}`, password: "password123", accessKey: "abc122" }, false)).status, 201);
    assert.equal(customKey.usedCount, 3); assert.equal(customKey.used, true);
    assert.equal((await request("POST", "/api/auth/register", { username: "keyuser4", password: "password123", accessKey: "abc122" }, false)).status, 400);
    assert.equal((await request("GET", "/api/playlists", null, false)).status, 401);
    assert.equal((await request("GET", "/api/profile/staff-team")).body[0].rank, "Admin");
    registered[0].isOwner = true;
    actor = { ...owner, rank: "Developer" };
    assert.equal((await request("PATCH", `/api/developer/users/${registered[0].id}`, { username: "renamedOwner" })).status, 403);
    assert.equal((await request("PATCH", `/api/developer/users/${registered[0].id}/rank`, { rank: "Access" })).status, 403);
    assert.equal((await request("DELETE", `/api/developer/users/${registered[0].id}/profile-picture`)).status, 403);
    assert.equal((await request("DELETE", `/api/developer/users/${registered[0].id}`)).status, 403);
    actor = owner;
    assert.equal((await request("POST", "/api/profile/requests", { sourceUrl: "https://example.com/watch?v=abcdefghijk" })).status, 400);
    assert.equal((await request("POST", "/api/profile/requests", { sourceUrl: "https://www.youtube.com/playlist?list=foo" })).status, 400);
    assert.equal((await request("POST", "/api/profile/requests", { sourceUrl: "https://open.spotify.com/album/4cOdK2wGLETKBW3PvgPWqT" })).status, 400);
    const spotify = await request("POST", "/api/profile/requests", { sourceUrl: "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=test" });
    assert.equal(spotify.status, 201); assert.equal(spotify.body.sourceUrl, "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"); assert.equal(spotify.body.requestedTitle, "Spotify test track");
    const queued = await request("POST", "/api/profile/requests", { sourceUrl: "https://youtu.be/abcdefghijk?t=31" });
    assert.equal(queued.status, 201); assert.equal(queued.body.sourceUrl, "https://www.youtube.com/watch?v=abcdefghijk");
    assert.equal((await request("POST", `/api/profile/staff/requests/${queued.body.id}/import`, { title: "Song", artist: "Artist" })).status, 403);
    actor = { ...owner, rank: "Admin" };
    assert.equal((await request("POST", `/api/profile/staff/requests/${spotify.body.id}/import`, { title: "Song", artist: "Artist" })).status, 400);
    assert.equal((await request("PATCH", `/api/profile/staff/requests/${spotify.body.id}`, { status: "Accepted" })).status, 200);
    assert.equal((await request("POST", `/api/profile/staff/requests/${queued.body.id}/import`, { title: " ", artist: "Artist" })).status, 400);
    assert.equal((await request("POST", `/api/profile/staff/requests/${queued.body.id}/import`, { title: "Song", artist: "Artist" })).status, 202);
    assert.equal((await request("POST", `/api/profile/staff/requests/${queued.body.id}/import`, { title: "Song", artist: "Artist" })).status, 409);
    assert.equal((await request("DELETE", `/api/profile/requests/${queued.body.id}`)).status, 409);
    actor = owner;
    assert.equal((await request("PATCH", "/api/profile/updates/post1", { content: "changed" })).status, 403);
    assert.equal((await request("PATCH", "/api/music/s1", { title: "Changed", artist: "Artist" })).status, 403);
    actor = { ...owner, rank: "Admin" };
    assert.equal((await request("PATCH", "/api/music/s1", { title: " ", artist: "Artist" })).status, 400);
    assert.equal((await request("PATCH", "/api/music/s1", { title: "Changed", artist: "Artist", filePath: "/evil" })).status, 400);
    const edited = await request("PATCH", "/api/music/s1", { title: " Új dal ", artist: " Előadó " });
    assert.equal(edited.status, 200); assert.equal(edited.body.title, "Új dal"); assert.equal(edited.body.artist, "Előadó"); assert.ok(!("filePath" in edited.body)); assert.equal(songs[0].filePath, "/private/one.mp3"); assert.equal(logs.at(-1).actionType, "music.edited");
    actor = { ...owner, rank: "Developer" };
    assert.equal((await request("PATCH", "/api/music/s1", { title: "Új dal", artist: "" })).body.artist, null);
    assert.equal((await request("PATCH", "/api/music/missing", { title: "Changed", artist: null })).status, 404);
    actor = owner;
    assert.equal((await request("POST", "/api/music/upload", { title: "Nope" })).status, 403);
    actor = { ...owner, rank: "Moderator" };
    assert.equal((await request("PATCH", "/api/music/s1", { title: "Moderator edit", artist: "Artist" })).status, 200);
    assert.equal((await request("POST", "/api/music/upload", { title: "Allowed role" })).status, 400);
    const musicUploadSetup = await request("POST", "/api/music/upload/upload-url", { mimeType: "audio/mpeg", size: 123 });
    assert.equal(musicUploadSetup.status, 200); assert.equal(musicUploadSetup.body.uploadUrl, "https://r2.test/music/direct");
    const directSong = await request("POST", "/api/music/upload/complete", { uploadToken: musicUploadSetup.body.uploadToken, title: "Direct song", artist: "Artist" });
    assert.equal(directSong.status, 201); assert.equal(directSong.body.filePath, "r2://music/direct.mp3");
    assert.equal((await request("POST", "/api/music/upload/upload-url", { mimeType: "image/png", size: 123 })).status, 415);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const artworkForm = new FormData(); artworkForm.append("file", new Blob([png], { type: "image/png" }), "song.png");
    const artworkResponse = await fetch(base + "/api/music/s1/picture", { method: "POST", headers: { Authorization: "Bearer mock" }, body: artworkForm });
    assert.equal(artworkResponse.status, 200); assert.ok((await artworkResponse.json()).artworkUrl.includes("/media/music-artwork/"));
    const badArtworkForm = new FormData(); badArtworkForm.append("file", new Blob(["not a picture"], { type: "image/png" }), "fake.png");
    assert.equal((await fetch(base + "/api/music/s1/picture", { method: "POST", headers: { Authorization: "Bearer mock" }, body: badArtworkForm })).status, 415);
    assert.equal((await request("DELETE", "/api/music/s1/picture")).status, 204);
    assert.equal((await request("DELETE", "/api/music/s1")).status, 403);
    actor = owner;
    const directPhotoSetup = await request("POST", "/api/profile/me/picture/upload-url", { mimeType: "image/png", size: 68 });
    assert.equal(directPhotoSetup.status, 200);
    const directPhoto = await request("POST", "/api/profile/me/picture/complete", { uploadToken: directPhotoSetup.body.uploadToken });
    assert.equal(directPhoto.status, 200); assert.ok(directPhoto.body.profilePicture.includes("/media/profile/"));
    const photoForm = new FormData(); photoForm.append("file", new Blob([png], { type: "image/png" }), "avatar.png");
    const photoResponse = await fetch(base + "/api/profile/me/picture", { method: "POST", headers: { Authorization: "Bearer mock" }, body: photoForm });
    assert.equal(photoResponse.status, 200); const photo = await photoResponse.json(); assert.ok(photo.profilePicture.includes("/media/profile/"));
    assert.deepEqual(fs.readFileSync(path.join(tempDirectory, "profile", path.basename(photo.profilePicture))), png);
    const badForm = new FormData(); badForm.append("file", new Blob(["Not a picture"], { type: "image/png" }), "fake.png");
    assert.equal((await fetch(base + "/api/profile/me/picture", { method: "POST", headers: { Authorization: "Bearer mock" }, body: badForm })).status, 415);
    assert.equal((await request("POST", "/api/playlists", { name: " " })).status, 400);
    const created = await request("POST", "/api/playlists", { name: "Evening mix", isPublic: true }); assert.equal(created.status, 201); const id = created.body.id;
    const directPlaylistSetup = await request("POST", `/api/playlists/${id}/picture/upload-url`, { mimeType: "image/webp", size: 68 });
    assert.equal(directPlaylistSetup.status, 200);
    assert.equal((await request("POST", `/api/playlists/${id}/picture/complete`, { uploadToken: directPlaylistSetup.body.uploadToken })).status, 200);
    const playlistPhoto = new FormData(); playlistPhoto.append("file", new Blob([png], { type: "image/png" }), "cover.png");
    const playlistPhotoResponse = await fetch(base + `/api/playlists/${id}/picture`, { method: "POST", headers: { Authorization: "Bearer mock" }, body: playlistPhoto });
    assert.equal(playlistPhotoResponse.status, 200); assert.ok((await playlistPhotoResponse.json()).artworkUrl.includes("/media/playlist/"));
    assert.equal((await request("POST", "/api/playlists/" + id + "/songs", { musicId: "s2" })).status, 204);
    assert.equal((await request("POST", "/api/playlists/" + id + "/songs", { musicId: "s1" })).status, 204);
    await request("POST", "/api/playlists/" + id + "/songs", { musicId: "s2" }); assert.equal(links.length, 2);
    assert.equal((await request("POST", "/api/playlists/" + id + "/songs", { musicId: "missing" })).status, 404);
    let detail = (await request("GET", "/api/playlists/" + id)).body; assert.deepEqual(detail.songs.map(s => s.id), ["s2", "s1"]); assert.ok(!("filePath" in detail.songs[0]));
    await request("POST", "/api/music/s1/like"); await request("POST", "/api/music/s1/like"); assert.equal(favorites.length, 1);
    let favoriteResult = (await request("GET", "/api/music/favorites")).body; assert.equal(favoriteResult.length, 1); assert.equal(favoriteResult[0].liked, true);
    actor = other;
    const otherIdea = await request("POST", "/api/profile/update-ideas", { content: "Please add a sleep timer" }); assert.equal(otherIdea.status, 201);
    actor = owner; await request("POST", "/api/profile/update-ideas", { content: "Please add lyrics" });
    assert.equal((await request("GET", "/api/profile/update-ideas")).body.length, 1);
    actor = { ...owner, rank: "Admin" }; const allIdeas = (await request("GET", "/api/profile/update-ideas")).body; assert.equal(allIdeas.length, 2); assert.ok(allIdeas.every(i => i.user?.username));
    actor = other;
    assert.equal((await request("GET", "/api/music/favorites")).body.length, 0);
    assert.equal((await request("DELETE", "/api/playlists/" + id + "/songs/s1")).status, 403);
    assert.equal((await request("POST", "/api/playlists/" + id + "/songs", { musicId: "s1" })).status, 403);
    assert.equal((await request("DELETE", "/api/playlists/" + id)).status, 404);
    assert.equal((await request("GET", "/api/playlists?q=EVENING")).body.length, 1);
    assert.equal((await request("GET", "/api/playlists?library=true")).body.length, 0);
    await request("POST", "/api/playlists/" + id + "/save"); assert.equal((await request("GET", "/api/playlists?library=true")).body[0].saved, true);
    await request("DELETE", "/api/playlists/" + id + "/save"); assert.equal((await request("GET", "/api/playlists?library=true")).body.length, 0);
    actor = owner; const privateCreated = await request("POST", "/api/playlists", { name: "Private" }); assert.equal(privateCreated.body.isPublic, false); const privateId = privateCreated.body.id;
    actor = other; assert.equal((await request("GET", "/api/playlists/" + privateId)).status, 404); assert.equal((await request("POST", "/api/playlists/" + privateId + "/save")).status, 404);
    assert.equal((await request("GET", "/api/playlists?q=Private")).body.length, 0);
    actor = owner; assert.equal((await request("PATCH", "/api/playlists/" + privateId, { isPublic: true })).status, 200);
    actor = other; assert.equal((await request("GET", "/api/playlists/" + privateId)).status, 200);
    assert.equal((await request("PATCH", "/api/playlists/" + privateId, { isPublic: false })).status, 404);
    assert.equal((await request("POST", "/api/playlists/" + privateId + "/save")).status, 204);
    actor = owner; assert.equal((await request("PATCH", "/api/playlists/" + privateId, { isPublic: false })).status, 200);
    actor = other; assert.equal((await request("GET", "/api/playlists/" + privateId)).status, 404);
    assert.equal((await request("GET", "/api/playlists?library=true")).body.length, 0);
    assert.equal((await request("DELETE", "/api/music/s1")).status, 403);
    actor = { ...other, rank: "Admin" }; assert.equal((await request("DELETE", "/api/music/s1")).status, 204); assert.equal(logs.at(-1).actionType, "music.deleted"); assert.ok(!favorites.length); assert.ok(!links.some(l => l.musicId === "s1"));
    assert.equal((await request("DELETE", "/api/profile/updates/post1")).status, 403);
    actor = { ...owner, rank: "Developer" }; assert.equal((await request("DELETE", "/api/music/s2")).status, 204);
    assert.equal((await request("GET", "/api/music?ids=" + Array(21).fill("s1").join(","))).status, 400);
    actor = owner; await request("DELETE", "/api/playlists/" + id); assert.equal((await request("GET", "/api/playlists/" + id)).status, 404);
    console.log("PASS: three-use access key, Moderator upload-only role, playlist picture upload, and Update Ideas visibility.");
    console.log("PASS: HTTP playlist/favorite contracts, privacy, ownership, duplicate handling, order, role-restricted deletion and cascade/audit contracts.");
    console.log("PASS: Admin/Developer title/artist edits, validation/audit, unchanged audio file; real multipart PNG upload and fake-image rejection.");
  } finally {
    await new Promise(resolve => server.close(resolve));
    const pictures = path.join(tempDirectory, "profile");
    if (fs.existsSync(pictures)) { for (const name of fs.readdirSync(pictures)) fs.unlinkSync(path.join(pictures, name)); fs.rmdirSync(pictures); }
    const playlistPictures = path.join(tempDirectory, "playlist");
    if (fs.existsSync(playlistPictures)) { for (const name of fs.readdirSync(playlistPictures)) fs.unlinkSync(path.join(playlistPictures, name)); fs.rmdirSync(playlistPictures); }
    const artworkPictures = path.join(tempDirectory, "music-artwork");
    if (fs.existsSync(artworkPictures)) { for (const name of fs.readdirSync(artworkPictures)) fs.unlinkSync(path.join(artworkPictures, name)); fs.rmdirSync(artworkPictures); }
    fs.rmdirSync(tempDirectory);
  }
  const storage = new Map();
  const history = load("apps/mobile/src/lib/history.ts", { "@react-native-async-storage/async-storage": { getItem: async key => storage.get(key) || null, setItem: async (key, value) => storage.set(key, value) } });
  await Promise.all(Array.from({ length: 15 }, (_, i) => history.historyFor(owner.id, { kind: "song", musicId: "song" + i, at: i })));
  let recent = await history.historyFor(owner.id); assert.equal(recent.length, 10); assert.equal(recent[0].musicId, "song14");
  storage.set(`f4we-history-${owner.id}`, JSON.stringify([{kind: "search", query: "Rock", at: 20}, ...recent]));
  recent = await history.historyFor(owner.id); assert.equal(recent.filter(e => e.kind === "search").length, 0); assert.equal((await history.historyFor(other.id)).length, 0);
  assert.equal((await history.historyFor(owner.id, undefined, "song14")).some(e => e.musicId === "song14"), false);
  assert.equal(history.parseHistory("invalid").length, 0);
  console.log("PASS: last-10 persisted history, parallel writes, legacy search cleanup, account isolation and deleted-song cleanup.");
  const jsx = (type, props) => ({ type, props }); let uiActor = owner;
  const post = { id: "post1", developerId: owner.id, developer: owner, content: "Release", postedDate: new Date().toISOString() };
  const reactMock = { useState: initial => [Array.isArray(initial) ? [post] : initial, () => {}], useCallback: callback => callback };
  const updates = load("apps/mobile/app/profile/updates.tsx", { react: reactMock, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" }, "expo-router": { useFocusEffect: () => {} }, "react-native": { Alert: {}, Modal: "Modal", Pressable: "Pressable", Text: "Text", View: "View" }, "../../src/components/UI": { Button: "Button", Card: "Card", Empty: "Empty", Input: "Input", Screen: "Screen", Title: "Title", ui: {} }, "../../src/context/AuthContext": { useAuth: () => ({ user: uiActor }) }, "../../src/lib/api": { api: async () => [] }, "../../src/lib/theme": { colors: {} } });
  function texts(node) { if (typeof node === "string") return [node]; if (Array.isArray(node)) return node.flatMap(texts); return node?.props ? texts(node.props.children) : []; }
  assert.ok(!texts(updates.default()).includes("Edit")); uiActor = { ...owner, rank: "Admin" }; assert.ok(!texts(updates.default()).includes("Delete"));
  uiActor = { ...owner, rank: "Developer" }; assert.ok(texts(updates.default()).includes("Edit")); assert.ok(texts(updates.default()).includes("Delete"));
  uiActor = { ...other, rank: "Developer" }; assert.ok(!texts(updates.default()).includes("Edit"));
  console.log("PASS: update Edit/Delete controls hidden for Access/Admin and other Developers, even for a demoted post author.");
  const actions = [];
  const row = load("apps/mobile/src/components/SongRow.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx }, "@expo/vector-icons": { Ionicons: "Icon" },
    "react-native": { Alert: {}, Image: "Image", Pressable: "Pressable", Text: "Text", View: "View", StyleSheet: { create: s => s } },
    "../lib/theme": { colors: {} }, "../context/PlayerContext": { usePlayer: () => ({ play: async s => actions.push("play:" + s.id) }) },
    "../context/LibraryContext": { useLibrary: () => ({ isFavorite: () => false, choosePlaylist: s => actions.push("add:" + s.id), toggleFavorite: async s => actions.push("like:" + s.id) }) }
  });
  const rendered = row.SongRow({ song: { id: "s1", title: "One", streamUrl: "test" } });
  assert.equal(rendered.type, "View"); const controls = rendered.props.children.slice(1, 4);
  assert.equal(controls.map(c => c.props.children.props.name).join(","), "add-circle-outline,heart-outline,play-circle");
  controls[0].props.onPress(); assert.deepEqual(actions, ["add:s1"]);
  controls[1].props.onPress(); assert.deepEqual(actions, ["add:s1", "like:s1"]);
  controls[2].props.onPress(); assert.equal(actions.at(-1), "play:s1");
  console.log("PASS: + / heart / play control order; add and favorite do not accidentally start playback.");
  const media = load("apps/mobile/src/lib/media.ts", { "./api": { API_URL: "http://10.0.2.2:4000" } });
  assert.equal(media.profilePictureUrl("http://localhost:4000/media/profile/avatar.png"), "http://10.0.2.2:4000/media/profile/avatar.png");
  assert.equal(media.profilePictureUrl("/media/profile/avatar.png"), "http://10.0.2.2:4000/media/profile/avatar.png");
  assert.equal(media.profilePictureUrl("https://cdn.example.org/photo.jpg"), "https://cdn.example.org/photo.jpg");
  const uploadCalls = []; let nativeUpload;
  const mobileApi = load("apps/mobile/src/lib/api.ts", {
    "expo-constants": { expoConfig: { extra: { apiUrl: "https://api.test" } } },
    "expo/fetch": { fetch: async (url, options) => {
      uploadCalls.push({ url, options });
      if (url.endsWith("/upload-url")) return { status: 200, json: async () => ({ uploadUrl: "https://r2.test/signed", uploadToken: "upload-token", contentType: "audio/mpeg", expiresIn: 600 }) };
      if (url.endsWith("/complete")) return { status: 201, json: async () => ({ id: "direct-song" }) };
      throw new Error("Unexpected API URL " + url);
    } },
    "expo-file-system": { File: class { constructor(uri) { this.uri = uri; } async upload(url, options) { nativeUpload = { uri: this.uri, url, options }; return { status: 200, body: "" }; } }, UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 } }
  });
  mobileApi.setApiToken("session-token");
  const uploadedSong = await mobileApi.uploadFile("/api/music/upload", { uri: "file:///cache/song.mp3", name: "song.mp3", type: "audio/mp3", size: 1234 }, { title: "Song" });
  assert.equal(uploadedSong.id, "direct-song"); assert.equal(uploadCalls.length, 2);
  assert.equal(uploadCalls[0].url, "https://api.test/api/music/upload/upload-url"); assert.equal(uploadCalls[0].options.headers.Authorization, "Bearer session-token");
  assert.equal(JSON.parse(uploadCalls[0].options.body).size, 1234); assert.equal(nativeUpload.url, "https://r2.test/signed");
  assert.equal(nativeUpload.options.httpMethod, "PUT"); assert.equal(nativeUpload.options.headers["Content-Type"], "audio/mpeg"); assert.ok(!nativeUpload.options.headers.Authorization);
  assert.deepEqual(JSON.parse(uploadCalls[1].options.body), { uploadToken: "upload-token", title: "Song" });
  console.log("PASS: mobile obtains a signed URL, uploads bytes straight to R2, then completes through the authenticated API.");
  let permission = true, oversized = false, uploads = 0, refreshed = 0, permissionCalls = 0; const alerts = [], platform = { OS: "android" };
  const profile = load("apps/mobile/app/(tabs)/profile.tsx", {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {} }, "react/jsx-runtime": { jsx, jsxs: jsx },
    "@expo/vector-icons": { Ionicons: "Icon" }, "expo-clipboard": { setStringAsync: async () => {} }, "expo-router": { router: {} },
    "expo-image-picker": { requestMediaLibraryPermissionsAsync: async () => { permissionCalls++; return { granted: permission }; }, launchImageLibraryAsync: async () => ({ canceled: false, assets: [{ uri: "file:///cache/avatar.png", fileName: "avatar.png", mimeType: "image/png", fileSize: oversized ? 6 * 1024 * 1024 : 3 }] }) },
    "react-native": { Platform: platform, ActivityIndicator: "Spinner", Alert: { alert: (...args) => alerts.push(args) }, Image: "Image", Pressable: "Pressable", Text: "Text", View: "View", StyleSheet: { create: s => s } },
    "../../src/components/F4WEAlert": { F4WEAlert: { alert: (...args) => alerts.push(args) } },
    "../../src/components/UI": { Button: "Button", Card: "Card", RankBadge: "Badge", OwnerBadge: "OwnerBadge", Screen: "Screen", Title: "Title", ui: {} },
    "../../src/context/AuthContext": { useAuth: () => ({ user: owner, refresh: async () => refreshed++, logout: async () => {} }) },
    "../../src/lib/theme": { colors: {} }, "../../src/lib/media": media, "../../src/lib/time": { fullDuration: value => String(value) },
    "../../src/lib/api": { api: async () => ({}), uploadFile: async (route, file) => { assert.equal(route, "/api/profile/me/picture"); assert.equal(file.uri, "file:///cache/avatar.png"); assert.equal(file.name, "avatar.png"); assert.equal(file.type, "image/png"); assert.equal(file.size, 3); uploads++; } }
  });
  function find(node, predicate) {
    if (!node) return undefined;
    if (Array.isArray(node)) { for (const child of node) { const result = find(child, predicate); if (result) return result; } return undefined; }
    if (predicate(node)) return node;
    return node.props ? find(node.props.children, predicate) : undefined;
  }
  const clickPhoto = async () => { find(profile.default(), n => n.props?.accessibilityLabel === "Change profile picture").props.onPress(); await new Promise(resolve => setTimeout(resolve, 10)); };
  await clickPhoto(); assert.equal(uploads, 1); assert.equal(refreshed, 1); assert.equal(alerts.length, 0); assert.equal(permissionCalls, 0);
  platform.OS = "ios"; permission = false; await clickPhoto(); assert.equal(uploads, 1); assert.equal(permissionCalls, 1); assert.equal(alerts.at(-1)[0], "Photo permission needed");
  permission = true; oversized = true; await clickPhoto(); assert.equal(uploads, 1); assert.ok(alerts.at(-1)[1].includes("5 MB"));
  console.log("PASS: profile passes a direct-R2 upload descriptor; permission/size handling; server picture URLs use the device-reachable API host.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
