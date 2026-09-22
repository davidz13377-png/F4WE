// Exercise the worker state transitions without making a YouTube request.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
const { pathToFileURL } = require('node:url');

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'f4we-import-test-'));
const sourcePath = path.join(__dirname, '../apps/bot/src/importRequests.ts');
const source = fs.readFileSync(sourcePath, 'utf8').replaceAll('import.meta.url', JSON.stringify(pathToFileURL(sourcePath).href));
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const moduleOut = { exports: {} };
let failDownload = false, spawned = 0;
function spawn(_binary, args) {
  spawned++;
  assert.equal(args.at(-1), 'https://www.youtube.com/watch?v=abcdefghijk');
  assert.ok(args.includes('--no-playlist'));
  assert.ok(args.includes('--js-runtimes'));
  assert.ok(args.some(value => value.startsWith('node:')));
  assert.ok(args.includes('ba[protocol=https]/ba[protocol=http]/ba/b'));
  const child = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
  process.nextTick(() => {
    if (!failDownload) fs.writeFileSync(args[args.indexOf('-o') + 1].replace('%(ext)s', 'mp3'), Buffer.from('ID3\0\0\0\0'));
    child.emit('close', failDownload ? 1 : 0);
  });
  return child;
}
function requireMock(name) {
  if (name === 'node:child_process') return { spawn };
  if (name === 'file-type') return { fileTypeFromFile: async () => ({ mime: 'audio/mpeg' }) };
  if (name === './env.js') return { env: { API_UPLOAD_DIR: uploadDir, YT_DLP_BIN: 'mock-yt-dlp', FFMPEG_BIN: 'mock-ffmpeg' } };
  return require(name);
}
vm.runInNewContext(js, { module: moduleOut, exports: moduleOut.exports, require: requireMock, URL, Buffer, Date, Promise, console, setTimeout, clearTimeout, process });
const row = { id: 'request1', status: 'Processing', sourceUrl: 'https://www.youtube.com/watch?v=abcdefghijk', requestedTitle: 'Track', requestedArtist: 'Artist', importStartedAt: null, userId: '1111111111111111' };
let songs = [], notifications = [], events = [];
const prisma = {
  musicRequest: {
    findMany: async () => row.status === 'Processing' ? [row] : [],
    updateMany: async ({ where, data }) => { if (where.id !== row.id || where.status !== row.status || where.importStartedAt !== row.importStartedAt) return { count: 0 }; Object.assign(row, data); return { count: 1 }; },
    update: async ({ data }) => { Object.assign(row, data); return row; }
  },
  music: { create: async ({ data }) => { const song = { ...data, id: 'song1' }; songs.push(song); return song; } },
  notification: { create: async ({ data }) => notifications.push(data) },
  logEvent: { create: async ({ data }) => events.push(data) },
  $transaction: async fn => typeof fn === 'function' ? fn(prisma) : Promise.all(fn)
};
(async () => {
  try {
    await moduleOut.exports.importQueuedRequests(prisma);
    assert.equal(row.status, 'Accepted'); assert.equal(row.importedMusicId, 'song1');
    assert.equal(songs[0].title, 'Track'); assert.equal(songs[0].artist, 'Artist');
    assert.equal(fs.readFileSync(songs[0].filePath).subarray(0, 3).toString(), 'ID3');
    assert.equal(notifications.length, 1); assert.equal(events.at(-1).actionType, 'music_request.imported');
    row.status = 'Processing'; row.importStartedAt = null; row.importedMusicId = null; row.id = 'request2';
    failDownload = true;
    const originalError = console.error; console.error = () => {};
    try { await moduleOut.exports.importQueuedRequests(prisma); } finally { console.error = originalError; }
    assert.equal(row.status, 'Rejected'); assert.equal(songs.length, 1);
    assert.equal(events.at(-1).actionType, 'music_request.import_failed');
    row.status = 'Processing'; row.importStartedAt = null; row.id = 'request3'; row.sourceUrl = 'https://evil.example/watch?v=abcdefghijk';
    const before = spawned;
    console.error = () => {};
    try { await moduleOut.exports.importQueuedRequests(prisma); } finally { console.error = originalError; }
    assert.equal(row.status, 'Rejected'); assert.equal(spawned, before);
    console.log('PASS: worker imports a verified MP3, records failure, and rejects unexpected hosts before download.');
  } finally { fs.rmSync(uploadDir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
