const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const fallbackArt = "assets/f4we-icon.png";
const heroArt = "assets/featured-eclipse.png";
const safe = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const image = value => safe(value || fallbackArt);
const icon = (name, className = "") => `<svg class="icon ${safe(className)}" aria-hidden="true"><use href="#icon-${safe(name)}"></use></svg>`;
const formatTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; };
const formatLongTime = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); const days = Math.floor(value / 86400), hours = Math.floor(value % 86400 / 3600), minutes = Math.floor(value % 3600 / 60); return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(" ") || "0m"; };
const isStaff = user => !!user?.isOwner || ["Moderator", "Admin", "Developer"].includes(user?.rank);
const isDeveloper = user => !!user?.isOwner || user?.rank === "Developer";

const state = {
  config: { apiUrl: "", version: "1.4.0" }, token: localStorage.getItem("f4we.token") || "", user: null,
  songs: [], playlists: [], favorites: [], friends: [], artists: [], releases: [], rotation: [], featured: null,
  notifications: [], view: "home", settingsTab: "account", history: ["home"], historyIndex: 0,
  active: null, queue: [], queueIndex: -1, shuffle: false, repeat: false, playId: null, heartbeat: null,
  playbackRequest: 0, rewardStartedAt: null, rewardPendingMs: 0, presenceCleanup: [], lastCoinEvent: null,
  listeningFollowers: [], followingId: null, selectedArtistImage: null, selectedArtistHero: null, selectedReleaseImage: null,
  catalogSongs: [], modalBlocking: false, maintenanceTimer: null, pendingAnnouncements: []
};

const audio = new Audio();
audio.preload = "metadata";
audio.volume = Number(localStorage.getItem("f4we.volume") || .82);

function toast(message, type = "info") {
  const element = document.createElement("div"); element.className = `toast ${type}`; element.textContent = message;
  $("#toast-stack").append(element); setTimeout(() => element.remove(), 4300);
}

function showModal(markup, blocking = false) {
  state.modalBlocking = blocking;
  $("#modal-content").innerHTML = markup;
  $("#modal .modal-close").classList.toggle("hidden", blocking);
  $("#modal").classList.remove("hidden");
}
function closeModal(force = false) {
  if (state.modalBlocking && !force) return;
  state.modalBlocking = false;
  $("#modal").classList.add("hidden");
  $("#modal .modal-close").classList.remove("hidden");
  $("#modal-content").innerHTML = "";
}
function uploadError(result, fallback = "Upload failed") {
  if (result?.status === 404 && String(result?.data?.error || "").toLowerCase().includes("route not found")) {
    return "The latest F4WE API is not online yet. Deploy the API update, then try again.";
  }
  return result?.data?.error || `${fallback}${result?.status ? ` (HTTP ${result.status})` : ""}`;
}

async function api(route, options = {}) {
  const result = await window.f4we.request(route, options);
  if (result.ok) return result.data;
  const message = result.status === 429
    ? "Too many requests were sent. Wait about one minute, then try again."
    : typeof result.data?.error === "string" ? result.data.error : `Request failed (HTTP ${result.status})`;
  if (result.status === 401 && state.token) { logout(false); toast(message, "error"); }
  if (result.status === 426) showUpdateRequired(result.data);
  if (result.status === 503 && result.data?.code === "MAINTENANCE") showMaintenance(result.data);
  const error = new Error(message); error.status = result.status; error.details = result.data; throw error;
}

function showUpdateRequired(value) {
  showModal(`<div class="section-kicker">UPDATE REQUIRED</div><h2>A new F4WE version is ready</h2><p>${safe(value?.error || "Please update F4WE to continue.")}</p><button class="primary" id="download-update">Open f4we.xyz</button>`, true);
  $("#download-update").addEventListener("click", () => window.f4we.openExternal(value?.downloadUrl || "https://f4we.xyz/"));
}

function showMaintenance(value) {
  showModal(`<div class="section-kicker">F4WE SYSTEM</div><h2>Maintenance break</h2><p>${safe(value?.error || "F4WE is currently under maintenance. This should not take long.")}</p><div class="maintenance-wait"><span></span>Windows will unlock automatically when maintenance ends.</div>`, true);
  if (state.maintenanceTimer) return;
  state.maintenanceTimer = setInterval(async () => {
    const result = await window.f4we.request("/api/system/status");
    if (result.ok && !result.data?.maintenanceApplies) {
      clearInterval(state.maintenanceTimer); state.maintenanceTimer = null; closeModal(true);
      if (state.token) void enterApp();
    }
  }, 10_000);
}

async function loadOwnerAnnouncements() {
  if (!state.token || state.modalBlocking) return;
  try {
    state.pendingAnnouncements = await api("/api/system/announcements/pending");
    showNextOwnerAnnouncement();
  } catch (error) { if (![401, 503].includes(error.status)) console.error(error); }
}

function showNextOwnerAnnouncement() {
  const announcement = state.pendingAnnouncements[0];
  if (!announcement) return closeModal(true);
  showModal(`<div class="section-kicker">F4WE MESSAGE</div><h2>${safe(announcement.title)}</h2><p class="announcement-body">${safe(announcement.body)}</p><p class="announcement-by">by ${safe(announcement.by)}</p><div class="form-actions"><button class="primary" id="announcement-ok">OK</button></div>`, true);
  $("#announcement-ok").addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    try {
      await api(`/api/system/announcements/${encodeURIComponent(announcement.id)}/dismiss`, { method: "POST" });
      state.pendingAnnouncements.shift(); showNextOwnerAnnouncement();
    } catch (error) { event.currentTarget.disabled = false; toast(error.message, "error"); }
  });
}

function setToken(token) {
  state.token = token || "";
  if (state.token) localStorage.setItem("f4we.token", state.token); else localStorage.removeItem("f4we.token");
  return window.f4we.setToken(state.token);
}

function userRank(user = state.user) { return user?.isOwner ? "Owner" : user?.rank || "Access"; }

function avatarMarkup(user, size = "medium", status = null) {
  const profileDesignUrl = user?.profileDesignUrl || "";
  return `<span class="profile-avatar profile-avatar-${safe(size)} ${profileDesignUrl ? "has-frame" : "no-frame"}">
    <img class="avatar-base" src="${image(user?.profilePicture)}" alt="${safe(user?.username || "F4WE profile")}">
    ${profileDesignUrl ? `<img class="avatar-frame" src="${image(profileDesignUrl)}" alt="">` : ""}
    ${status === null ? "" : `<i class="presence-dot ${status ? "" : "offline"}"></i>`}
  </span>`;
}

function updateUserChrome() {
  const avatar = state.user?.profilePicture || fallbackArt;
  $("#sidebar-avatar").src = avatar; $("#top-avatar").src = avatar;
  for (const id of ["#sidebar-frame", "#top-frame"]) {
    const frame = $(id); if (!frame) continue;
    const hasFrame = !!state.user?.profileDesignUrl;
    if (hasFrame) frame.src = state.user.profileDesignUrl; else frame.removeAttribute("src");
    frame.classList.toggle("hidden", !hasFrame);
    frame.setAttribute("aria-hidden", String(!hasFrame));
    frame.parentElement?.classList.toggle("has-frame", hasFrame);
  }
  $("#sidebar-name").textContent = state.user?.username || "F4WE"; $("#top-username").textContent = state.user?.username || "F4WE";
  $("#sidebar-rank").textContent = userRank();
}

function resetAccountState() {
  for (const key of ["songs", "playlists", "favorites", "friends", "artists", "releases", "rotation", "notifications", "queue", "listeningFollowers", "pendingAnnouncements", "catalogSongs"]) state[key] = [];
  for (const key of ["featured", "homeRotation", "homeRecent", "homeFeatured", "searchSongs", "openPlaylist", "openArtist", "openRelease", "friendCharts", "recapSongs"]) state[key] = null;
  state.queueIndex = -1; state.followingId = null; state.lastCoinEvent = null;
}

async function authenticate(mode, form) {
  const values = Object.fromEntries(new FormData(form));
  $("#auth-error").textContent = "";
  try {
    const result = await api(`/api/auth/${mode}`, { method: "POST", body: values });
    if (state.user?.id !== result.user.id) resetAccountState();
    await setToken(result.token); state.user = result.user; await enterApp();
  } catch (error) { $("#auth-error").textContent = error.message; }
}

async function enterApp() {
  $("#auth-screen").classList.add("hidden"); $("#app-shell").classList.remove("hidden"); updateUserChrome();
  renderLoading();
  try {
    const profile = await api("/api/profile/me");
    state.user = profile.user; if (profile.refreshedToken) await setToken(profile.refreshedToken); updateUserChrome();
    await loadCore(); connectPresence(); renderView(); await loadOwnerAnnouncements();
  } catch (error) {
    if (error.status !== 401) { toast(error.message, "error"); renderView(); }
  }
}

async function loadCore() {
  // Never keep another account's data if one of the new account's requests fails.
  for (const key of ["songs", "playlists", "favorites", "friends", "artists", "releases", "rotation", "notifications"]) state[key] = [];
  state.featured = null;
  const calls = await Promise.allSettled([
    api("/api/music"), api("/api/playlists?library=true"), api("/api/music/favorites"), api("/api/friends"),
    api("/api/artists"), api("/api/artists/releases"), api("/api/music/rotation"), api("/api/artists/featured"), api("/api/profile/notifications")
  ]);
  const defaults = ["songs", "playlists", "favorites", "friends", "artists", "releases", "rotation", "featured", "notifications"];
  calls.forEach((result, index) => { if (result.status === "fulfilled") state[defaults[index]] = result.value; });
  updateBadges(); renderFriendsPanel();
}

function connectPresence() {
  state.presenceCleanup.forEach(cleanup => cleanup());
  state.presenceCleanup = [];
  window.f4we.presence.disconnect();
  window.f4we.presence.connect(state.config.apiUrl, state.token);
  state.presenceCleanup.push(window.f4we.presence.on("listening:state", value => {
    const friend = state.friends.find(item => item.id === value.userId); if (friend) friend.listening = value;
    renderFriendsPanel();
    if (state.followingId === value.userId) void (async () => {
      if (state.active?.id !== value.musicId) {
        const songs = await api(`/api/music?ids=${encodeURIComponent(value.musicId)}`); if (songs[0]) await playSong(songs[0], songs, { following: true });
      }
      const target = Math.max(0, value.position + (value.playing ? (Date.now() - value.updatedAt) / 1000 : 0));
      if (Math.abs(audio.currentTime - target) > 1.25) audio.currentTime = target;
      if (value.playing && audio.paused) await audio.play(); else if (!value.playing && !audio.paused) audio.pause();
    })().catch(error => toast(error.message, "error"));
  }));
  state.presenceCleanup.push(window.f4we.presence.on("listening:unavailable", value => {
    const friend = state.friends.find(item => item.id === value.userId); if (friend) friend.listening = null;
    if (state.followingId === value.userId) { state.followingId = null; toast("Listening together ended"); }
    renderFriendsPanel();
  }));
  state.presenceCleanup.push(window.f4we.presence.on("listening:followers", value => { state.listeningFollowers = Array.isArray(value) ? value : []; if (state.view === "home") renderHome(); }));
  state.presenceCleanup.push(window.f4we.presence.on("coinsChanged", value => {
    if (state.user && Number.isFinite(value?.coins)) state.user.coins = value.coins;
    if (!value?.granted) return;
    const key = `${value.coins}:${value.granted}`, now = Date.now();
    if (state.lastCoinEvent?.key === key && now - state.lastCoinEvent.at < 2_000) return;
    state.lastCoinEvent = { key, at: now }; toast(`+${value.granted} F4WE COIN`);
  }));
  state.presenceCleanup.push(window.f4we.presence.on("profileChanged", value => { state.user = { ...state.user, ...value }; updateUserChrome(); }));
  state.presenceCleanup.push(window.f4we.presence.on("rankChanged", value => { state.user.rank = value.rank; updateUserChrome(); toast(`Your rank is now ${value.rank}.`); }));
}

function logout(showMessage = true) {
  state.playbackRequest++; void stopHeartbeat(false); audio.pause(); audio.removeAttribute("src"); state.user = null; state.active = null;
  resetAccountState();
  state.presenceCleanup.forEach(cleanup => cleanup()); state.presenceCleanup = [];
  window.f4we.mediaControls?.update({ active: false, playing: false });
  window.f4we.presence.disconnect(); void setToken("");
  $("#app-shell").classList.add("hidden"); $("#auth-screen").classList.remove("hidden");
  if (showMessage) toast("Signed out");
}

function navigate(view, push = true, render = true) {
  if (push && state.view !== view) { state.history = state.history.slice(0, state.historyIndex + 1); state.history.push(view); state.historyIndex++; }
  state.view = view; $$(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  if (render) renderView(); $("#content-scroll").scrollTop = 0;
}

function renderLoading() { $("#view").innerHTML = `<div class="hero skeleton"></div><div class="row-cards">${Array(5).fill('<div class="media-card skeleton" style="height:210px"></div>').join("")}</div>`; }
function updateBadges() { const unread = state.notifications.filter(item => !item.read).length; $("#notification-badge").textContent = unread; $("#notification-badge").classList.toggle("hidden", !unread); $("#top-notification-dot").classList.toggle("hidden", !unread); }

function mediaCard(item, kind = "song", source = "songs") {
  const art = kind === "artist" ? item.imageUrl : item.artworkUrl;
  const subtitle = kind === "artist" ? `${item.releaseCount || 0} releases` : kind === "release" ? `${item.artist?.name || "F4WE"} · ${item.type || "Album"}` : item.artist || "Unknown artist";
  const open = kind === "song" ? `data-play-song="${safe(item.id)}" data-queue-source="${safe(source)}"` : kind === "artist" ? `data-open-artist="${safe(item.id)}"` : `data-open-release="${safe(item.id)}"`;
  return `<article class="media-card ${kind === "artist" ? "artist-card" : ""}" ${open}>
    <div class="media-card-image"><img src="${image(art)}" alt=""><button class="card-play" ${open}>${icon("play")}</button></div>
    <strong>${safe(item.title || item.name)}</strong><small>${safe(subtitle)} ${kind === "artist" && item.verified ? '<span class="verified">◆</span>' : ""}</small>
  </article>`;
}

function songTable(songs, options = {}) {
  if (!songs?.length) return `<div class="empty-state"><strong>No music here yet</strong><p>Add music or choose another collection.</p></div>`;
  return `<div class="table"><div class="table-head"><span>#</span><span>Title</span><span>Album / artist</span><span>Time</span><span></span></div>${songs.map((song, index) => `<div class="song-row ${state.active?.id === song.id ? "active" : ""}" data-play-song="${safe(song.id)}" data-queue-source="${safe(options.source || "songs")}">
    <span class="song-index">${state.active?.id === song.id && !audio.paused ? icon("play", "row-play-icon") : index + 1}</span>
    <div class="song-main"><img src="${image(song.artworkUrl)}" alt=""><div><strong class="song-name">${safe(song.title)}</strong><span>${safe(song.artist || "Unknown artist")}</span></div></div>
    <span class="song-album">${safe(options.label || song.artist || "F4WE")}</span><span class="song-duration">${formatTime(song.duration)}</span>
    <div class="row-actions"><button class="${song.liked || state.favorites.some(item => item.id === song.id) ? "active" : ""}" data-like-song="${safe(song.id)}" title="Like">${icon("heart")}</button>${options.reorder ? `<button data-move-song="${safe(song.id)}" data-direction="up">↑</button><button data-move-song="${safe(song.id)}" data-direction="down">↓</button>` : ""}</div>
  </div>`).join("")}</div>`;
}

function renderFriendsPanel() {
  const container = $("#friends-activity"); if (!container) return;
  const friends = [...state.friends].sort((a, b) => Number(!!b.listening) - Number(!!a.listening) || Number(b.online) - Number(a.online)).slice(0, 7);
  container.innerHTML = friends.length ? friends.map(friend => `<div class="friend-activity profile-link" data-open-user="${safe(friend.id)}">
    ${avatarMarkup(friend, "small", friend.online)}
    <div class="friend-copy"><strong>${safe(friend.username)}</strong><p>${friend.listening ? `${icon("music", "inline-icon")} ${safe(friend.listening.title)} · ${safe(friend.listening.artist || "Unknown")}` : friend.online ? "Online" : "Offline"}</p></div>
    ${friend.listening ? `<button class="friend-join" data-join-friend="${safe(friend.id)}">JOIN</button>` : `<small>${friend.online ? "NOW" : ""}</small>`}
  </div>`).join("") : `<div class="empty-state"><strong>No friends yet</strong><p>Find people in the Friends page.</p></div>`;
}

function recentSongs() {
  const ids = readRecentIds();
  return ids.map(id => state.songs.find(song => song.id === id)).filter(Boolean).slice(0, 6);
}

function recentStorageKey() { return state.user?.id ? `f4we.recent.${state.user.id}` : null; }
function readRecentIds() {
  const key = recentStorageKey(); if (!key) return [];
  try { const value = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(value) ? value.filter(id => typeof id === "string") : []; }
  catch { return []; }
}
function rememberRecent(songId) {
  const key = recentStorageKey(); if (!key) return;
  localStorage.setItem(key, JSON.stringify([songId, ...readRecentIds().filter(id => id !== songId)].slice(0, 20)));
}

function renderHome() {
  const featured = state.featured;
  const featuredSongs = featured ? state.songs.filter(song => featured.tracks?.some?.(track => track.id === song.id)) : state.songs;
  const recommended = state.rotation;
  const recent = recentSongs();
  state.homeRotation = recommended;
  state.homeRecent = recent;
  state.homeFeatured = featuredSongs.length ? featuredSongs : state.songs;
  $("#view").innerHTML = `<section class="hero">
    <img class="hero-bg" src="${heroArt}" alt="F4WE Eclipse of Sound">
    <div class="hero-copy"><p class="section-kicker">FEATURED ALBUM</p><h1>${safe(featured?.title || "ECHOES IN SILENCE")}</h1><div class="artist-line">${safe(featured?.artist?.name || "F4WE")}</div><p>${safe(featured?.description || "A cinematic journey through late-night frequencies, shared moments and sound without limits.")}</p>
    <div class="hero-actions"><button class="round-play" data-play-song="${safe(featuredSongs[0]?.id || state.songs[0]?.id || "")}" data-queue-source="home-featured">${icon("play")}</button>${featured ? `<button class="save-button" data-open-release="${safe(featured.id)}">OPEN ALBUM</button>` : '<button class="save-button" data-view="albums">EXPLORE ALBUMS</button>'}</div></div>
    ${featured?.artworkUrl ? `<img class="hero-release-art" src="${image(featured.artworkUrl)}" alt="">` : ""}
  </section>
  ${state.listeningFollowers.length ? `<section class="surface"><h3>Listening with you</h3><p>${state.listeningFollowers.map(item => safe(item.username)).join(", ")} ${state.listeningFollowers.length === 1 ? "is" : "are"} synced to your music.</p></section>` : ""}
  <section class="section"><div class="section-head"><div><p class="section-kicker">CURATED FOR YOU</p><h2>Your Rotation This Week</h2></div><button data-view="search">View all</button></div><div class="row-cards">${recommended.slice(0, 6).map(item => mediaCard(item, "song", "home-rotation")).join("") || '<div class="empty-state">Start listening to build your rotation.</div>'}</div></section>
  <section class="section"><div class="section-head"><div><p class="section-kicker">JUMP BACK IN</p><h2>Recently Played</h2></div></div><div class="row-cards">${recent.map(item => mediaCard(item, "song", "home-recent")).join("") || '<div class="empty-state">Your recently played songs will appear here.</div>'}</div></section>
  <section class="section"><div class="section-head"><div><p class="section-kicker">DISCOVER</p><h2>Artists on F4WE</h2></div><button data-view="artists">View all</button></div><div class="row-cards">${state.artists.slice(0, 6).map(item => mediaCard(item, "artist")).join("") || '<div class="empty-state">Artists added by staff will appear here.</div>'}</div></section>`;
}

async function renderSearch(query = $("#search-input").value.trim()) {
  $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">DISCOVER F4WE</p><h1>${query ? `Results for “${safe(query)}”` : "Search"}</h1><p>Find songs, artists, albums, playlists and people.</p></div></div>${query ? '<div class="surface skeleton" style="height:160px"></div>' : '<div class="empty-state"><strong>What do you want to hear?</strong><p>Type into the search field above.</p></div>'}`;
  if (!query) return;
  try {
    const results = await Promise.allSettled([
      api(`/api/music?q=${encodeURIComponent(query)}`), api(`/api/playlists?q=${encodeURIComponent(query)}`),
      api(`/api/artists?q=${encodeURIComponent(query)}`), api(`/api/artists/releases?q=${encodeURIComponent(query)}`),
      query.length >= 2 ? api(`/api/friends/search?q=${encodeURIComponent(query)}`) : Promise.resolve([])
    ]);
    const [songs, playlists, artists, releases, people] = results.map(result => result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
    if (!songs.length && !playlists.length && !artists.length && !releases.length && !people.length && results.every(result => result.status === "rejected")) {
      throw results[0].reason;
    }
    $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">SEARCH RESULTS</p><h1>“${safe(query)}”</h1></div></div>
      <section class="section"><div class="section-head"><h2>Songs</h2></div>${songTable(songs.slice(0, 10), { source: "search" })}</section>
      <section class="section"><div class="section-head"><h2>Artists</h2></div><div class="row-cards">${artists.map(item => mediaCard(item, "artist")).join("") || '<p class="empty-state">No artists found.</p>'}</div></section>
      <section class="section"><div class="section-head"><h2>Albums</h2></div><div class="row-cards">${releases.map(item => mediaCard(item, "release")).join("") || '<p class="empty-state">No albums found.</p>'}</div></section>
      <section class="section"><div class="section-head"><h2>Playlists</h2></div><div class="row-cards">${playlists.map(playlistCard).join("") || '<p class="empty-state">No playlists found.</p>'}</div></section>
      <section class="section"><div class="section-head"><h2>People</h2></div><div class="people-grid">${people.map(user => `<button class="person-card" data-open-user="${safe(user.id)}">${avatarMarkup(user, "large")}<span><strong>${safe(user.username)}</strong><small>${safe(userRank(user))}</small></span></button>`).join("") || '<p class="empty-state">No people found.</p>'}</div></section>`;
    state.searchSongs = songs;
  } catch (error) { $("#view").innerHTML = `<div class="empty-state"><strong>Search failed</strong><p>${safe(error.message)}</p></div>`; }
}

function playlistCard(playlist) { return `<article class="media-card" data-open-playlist="${safe(playlist.id)}"><div class="media-card-image"><img src="${image(playlist.artworkUrl)}" alt=""><button class="card-play" data-open-playlist="${safe(playlist.id)}">→</button></div><strong>${safe(playlist.name)}</strong><small>${playlist.trackCount || 0} songs · ${formatLongTime(playlist.totalDuration)}</small></article>`; }

function renderLibrary(filter = "library") {
  const playlists = filter === "mine" ? state.playlists.filter(item => item.creatorId === state.user.id) : state.playlists;
  $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">YOUR COLLECTION</p><h1>${filter === "mine" ? "Your Playlists" : "Your Library"}</h1><p>Everything you saved, created and liked.</p></div><div class="page-actions"><button class="secondary icon-label" id="create-playlist">${icon("plus")} New playlist</button></div></div>
    <div class="tabs"><button class="${filter === "library" ? "active" : ""}" data-library-tab="library">All</button><button class="${filter === "mine" ? "active" : ""}" data-library-tab="mine">Created by you</button><button data-view="liked">Liked songs</button></div>
    <div class="row-cards">${playlists.map(playlistCard).join("") || '<div class="empty-state"><strong>Your library is waiting</strong><p>Create or save a playlist.</p></div>'}</div>`;
  $("#create-playlist").addEventListener("click", openCreatePlaylist);
  $$('[data-library-tab]').forEach(button => button.addEventListener("click", () => renderLibrary(button.dataset.libraryTab)));
}

function openCreatePlaylist() {
  showModal(`<h2>Create playlist</h2><form id="playlist-form"><div class="form-grid"><label class="field">Name<input name="name" maxlength="100" required></label><label class="field">Visibility<select name="isPublic"><option value="false">Private</option><option value="true">Public</option></select></label><label class="field full">Description<textarea name="description" maxlength="500"></textarea></label></div><div class="form-actions"><button class="primary">Create playlist</button></div></form>`);
  $("#playlist-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { const created = await api("/api/playlists", { method: "POST", body: { ...values, isPublic: values.isPublic === "true" } }); state.playlists.unshift(created); closeModal(); renderLibrary("mine"); toast("Playlist created"); } catch (error) { toast(error.message, "error"); } });
}

function renderLiked() { $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">YOUR MUSIC</p><h1>Liked Songs</h1><p>${state.favorites.length} songs you love.</p></div><button class="primary icon-label" data-play-song="${safe(state.favorites[0]?.id || "")}" data-queue-source="favorites">${icon("play")} Play all</button></div>${songTable(state.favorites, { source: "favorites", label: "Liked Songs" })}`; }

function renderArtists() { $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">F4WE CATALOG</p><h1>Artists</h1><p>Official artist pages created by the staff team.</p></div></div><div class="row-cards">${state.artists.map(item => mediaCard(item, "artist")).join("") || '<div class="empty-state"><strong>No artists yet</strong><p>Staff can add the first artist in Settings.</p></div>'}</div>`; }
function renderAlbums() { $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">F4WE CATALOG</p><h1>Albums & Releases</h1><p>Albums, EPs and singles from artists on F4WE.</p></div></div><div class="row-cards">${state.releases.map(item => mediaCard(item, "release")).join("") || '<div class="empty-state"><strong>No albums yet</strong><p>Albums added by staff will appear here.</p></div>'}</div>`; }

async function openArtist(id) {
  navigate("artist", true, false); $("#view").innerHTML = '<div class="hero skeleton"></div>';
  try {
    const artist = await api(`/api/artists/${encodeURIComponent(id)}`); state.openArtist = artist;
    $("#view").innerHTML = `<section class="artist-hero">${artist.heroUrl ? `<img class="artist-hero-bg" src="${image(artist.heroUrl)}" alt="">` : ""}<img class="artist-portrait" src="${image(artist.imageUrl)}" alt=""><div class="detail-copy"><p class="section-kicker">${artist.verified ? "◆ VERIFIED ARTIST" : "ARTIST"}</p><h1>${safe(artist.name)}</h1><p>${safe(artist.bio || `${artist.releases.length} releases on F4WE`)}</p><div class="detail-actions"><button class="primary" data-play-song="${safe(artist.music[0]?.id || "")}" data-queue-source="artist">▶ Play</button>${isStaff(state.user) ? '<button class="secondary" id="edit-artist">Edit artist</button>' : ""}</div></div></section>
      <section class="section"><div class="section-head"><h2>Popular</h2></div>${songTable(artist.music.slice(0, 10), { source: "artist", label: artist.name })}</section>
      <section class="section"><div class="section-head"><h2>Discography</h2></div><div class="row-cards">${artist.releases.map(item => mediaCard({ ...item, artist }, "release")).join("") || '<p class="empty-state">No releases yet.</p>'}</div></section>`;
    $("#edit-artist")?.addEventListener("click", () => editArtist(artist));
  } catch (error) { $("#view").innerHTML = `<div class="empty-state"><strong>Could not open artist</strong><p>${safe(error.message)}</p></div>`; }
}

async function openRelease(id) {
  navigate("release", true, false); $("#view").innerHTML = '<div class="hero skeleton"></div>';
  try {
    const release = await api(`/api/artists/releases/${encodeURIComponent(id)}`); state.openRelease = release;
    $("#view").innerHTML = `<section class="release-hero"><img src="${image(release.artworkUrl || release.artist.imageUrl)}" alt=""><div class="detail-copy"><p class="section-kicker">${safe(release.type || "ALBUM")}</p><h1>${safe(release.title)}</h1><p><button class="text-button" data-open-artist="${safe(release.artist.id)}">${safe(release.artist.name)}</button> · ${release.releaseDate ? new Date(release.releaseDate).getUTCFullYear() : new Date(release.createdAt).getUTCFullYear()} · ${release.tracks.length} songs</p><div class="detail-actions"><button class="primary" data-play-song="${safe(release.tracks[0]?.id || "")}" data-queue-source="release">▶ Play album</button>${isStaff(state.user) ? '<button class="secondary" id="edit-release">Edit album</button>' : ""}</div></div></section>${songTable(release.tracks, { source: "release", label: release.title })}`;
    $("#edit-release")?.addEventListener("click", () => editRelease(release));
  } catch (error) { $("#view").innerHTML = `<div class="empty-state"><strong>Could not open album</strong><p>${safe(error.message)}</p></div>`; }
}

async function pickCatalogAsset(category, title) {
  const result = await window.f4we.pickAndUpload({ accept: "image", title, startPath: "/api/artists/assets/upload-url", completePath: "/api/artists/assets/complete", startPayload: { category }, completePayload: { category } });
  if (result.canceled) return null;
  if (!result.ok) { toast(uploadError(result), "error"); return null; }
  return result.data.url;
}

async function editArtist(artist) {
  let imageUrl = artist.imageUrl || null, heroUrl = artist.heroUrl || null;
  showModal(`<p class="section-kicker">STAFF CATALOG</p><h2>Edit artist</h2><form id="edit-artist-form"><div class="form-grid"><label class="field">Artist name<input name="name" value="${safe(artist.name)}" maxlength="120" required></label><label class="field full">Biography<textarea name="bio" maxlength="2000">${safe(artist.bio || "")}</textarea></label><label class="check-song full"><input type="checkbox" name="verified" ${artist.verified ? "checked" : ""}> Verified artist</label><button type="button" class="file-picker" id="edit-artist-image">Change artist image</button><button type="button" class="file-picker" id="edit-artist-banner">Change artist banner</button></div><div class="asset-status" id="edit-artist-status">Portrait: ${imageUrl ? "set" : "default"} · Banner: ${heroUrl ? "set" : "none"}</div><div class="form-actions"><button class="primary">Save artist</button><button type="button" class="secondary" id="clear-artist-image">Remove image</button><button type="button" class="secondary" id="clear-artist-banner">Remove banner</button><button type="button" class="danger-button" id="delete-artist">Delete artist</button></div></form>`);
  const status = () => { $("#edit-artist-status").textContent = `Portrait: ${imageUrl ? "set" : "default"} · Banner: ${heroUrl ? "set" : "none"}`; };
  $("#edit-artist-image").addEventListener("click", async () => { const value = await pickCatalogAsset("artist", "Choose artist image"); if (value) { imageUrl = value; status(); } });
  $("#edit-artist-banner").addEventListener("click", async () => { const value = await pickCatalogAsset("artist", "Choose artist banner"); if (value) { heroUrl = value; status(); } });
  $("#clear-artist-image").addEventListener("click", () => { imageUrl = null; status(); });
  $("#clear-artist-banner").addEventListener("click", () => { heroUrl = null; status(); });
  $("#edit-artist-form").addEventListener("submit", async event => {
    event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/api/artists/${encodeURIComponent(artist.id)}`, { method: "PATCH", body: { name: values.name, bio: values.bio || null, imageUrl, heroUrl, verified: new FormData(event.currentTarget).has("verified") } });
      state.artists = await api("/api/artists"); closeModal(); toast("Artist updated"); await openArtist(artist.id);
    } catch (error) { toast(error.message, "error"); }
  });
  $("#delete-artist").addEventListener("click", async () => {
    if (!confirm(`Delete ${artist.name} and every album on this artist page? The music files will remain in F4WE.`)) return;
    try {
      await api(`/api/artists/${encodeURIComponent(artist.id)}`, { method: "DELETE" });
      [state.artists, state.releases] = await Promise.all([api("/api/artists"), api("/api/artists/releases")]);
      state.openArtist = null; closeModal(); toast("Artist deleted"); navigate("artists");
    } catch (error) { toast(error.message, "error"); }
  });
}

async function editRelease(release) {
  let songs;
  try { songs = await loadCatalogSongs(); } catch (error) { toast(error.message, "error"); return; }
  let artworkUrl = release.artworkUrl || null;
  showModal(`<p class="section-kicker">STAFF CATALOG</p><h2>Edit album</h2><form id="edit-release-form"><div class="form-grid"><label class="field">Artist<select name="artistId" required>${state.artists.map(item => `<option value="${safe(item.id)}" ${item.id === release.artist.id ? "selected" : ""}>${safe(item.name)}</option>`).join("")}</select></label><label class="field">Title<input name="title" value="${safe(release.title)}" maxlength="150" required></label><label class="field">Type<select name="type">${["Album","EP","Single"].map(type => `<option ${release.type === type ? "selected" : ""}>${type}</option>`).join("")}</select></label><label class="field">Release date<input name="releaseDate" type="date" value="${safe(release.releaseDate?.slice(0,10) || "")}"></label><label class="field full">Description<textarea name="description">${safe(release.description || "")}</textarea></label><button type="button" class="file-picker full" id="edit-release-image">Change album cover</button>${trackPickerMarkup(songs, release.tracks.map(song => song.id), "edit-release")}</div><div class="asset-status" id="edit-release-status">Cover: ${artworkUrl ? "set" : "default"}</div><div class="form-actions"><button class="primary">Save album</button><button type="button" class="secondary" id="clear-release-image">Remove cover</button><button type="button" class="danger-button" id="delete-release">Delete album</button></div></form>`);
  wireTrackSearch("edit-release");
  $("#edit-release-image").addEventListener("click", async () => { const value = await pickCatalogAsset("release-artwork", "Choose album cover"); if (value) { artworkUrl = value; $("#edit-release-status").textContent = "Cover: set"; } });
  $("#clear-release-image").addEventListener("click", () => { artworkUrl = null; $("#edit-release-status").textContent = "Cover: default"; });
  $("#edit-release-form").addEventListener("submit", async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try {
      await api(`/api/artists/releases/${encodeURIComponent(release.id)}`, { method: "PATCH", body: { artistId: form.get("artistId"), title: form.get("title"), type: form.get("type"), description: form.get("description") || null, releaseDate: form.get("releaseDate") || null, artworkUrl, songIds: form.getAll("songId") } });
      [state.artists, state.releases] = await Promise.all([api("/api/artists"), api("/api/artists/releases")]); closeModal(); toast("Album updated"); await openRelease(release.id);
    } catch (error) { toast(error.message, "error"); }
  });
  $("#delete-release").addEventListener("click", async () => {
    if (!confirm(`Delete the album ${release.title}? Its songs will remain in F4WE.`)) return;
    try {
      await api(`/api/artists/releases/${encodeURIComponent(release.id)}`, { method: "DELETE" });
      [state.artists, state.releases] = await Promise.all([api("/api/artists"), api("/api/artists/releases")]);
      state.openRelease = null; closeModal(); toast("Album deleted"); navigate("albums");
    } catch (error) { toast(error.message, "error"); }
  });
}

async function openPlaylist(id) {
  navigate("playlist", true, false); $("#view").innerHTML = '<div class="hero skeleton"></div>';
  try {
    const playlist = await api(`/api/playlists/${encodeURIComponent(id)}`); state.openPlaylist = playlist;
    $("#view").innerHTML = `<section class="playlist-hero"><img src="${image(playlist.artworkUrl)}" alt=""><div class="detail-copy"><p class="section-kicker">PLAYLIST ${playlist.isPublic ? "" : '· <span class="private-chip chip">PRIVATE</span>'}</p><h1>${safe(playlist.name)}</h1><p>${safe(playlist.description || "Created on F4WE")} · ${playlist.trackCount} songs · ${formatLongTime(playlist.totalDuration)}</p><div class="detail-actions"><button class="primary" data-play-song="${safe(playlist.songs[0]?.id || "")}" data-queue-source="playlist">▶ Play</button>${playlist.canEdit ? '<button class="secondary" id="edit-playlist">Edit playlist</button><button class="secondary" id="add-playlist-song">＋ Add songs</button>' : `<button class="secondary" id="save-playlist">${playlist.saved ? "Remove from library" : "Save to library"}</button>`}</div></div></section>
      ${songTable(playlist.songs, { source: "playlist", label: playlist.name, reorder: playlist.canEdit })}`;
    if (playlist.canEdit) { $("#edit-playlist").addEventListener("click", editPlaylist); $("#add-playlist-song").addEventListener("click", addPlaylistSong); }
    else $("#save-playlist")?.addEventListener("click", () => toggleSavePlaylist(playlist));
  } catch (error) { $("#view").innerHTML = `<div class="empty-state"><strong>Could not open playlist</strong><p>${safe(error.message)}</p></div>`; }
}

function editPlaylist() {
  const playlist = state.openPlaylist;
  showModal(`<h2>Edit playlist</h2><form id="edit-playlist-form"><div class="form-grid"><label class="field">Name<input name="name" value="${safe(playlist.name)}" required></label><label class="field">Visibility<select name="isPublic"><option value="false" ${!playlist.isPublic ? "selected" : ""}>Private</option><option value="true" ${playlist.isPublic ? "selected" : ""}>Public</option></select></label><label class="field full">Description<textarea name="description">${safe(playlist.description || "")}</textarea></label></div><div class="form-actions"><button class="primary">Save changes</button><button type="button" class="danger-button" id="delete-playlist">Delete playlist</button></div></form><section class="section"><h3>Collaborative playlist</h3><p>Invite an accepted friend. They can add, remove and reorder songs.</p><form id="collaborator-form"><label class="field">Friend username<input name="username" required></label><div class="form-actions"><button class="secondary">Invite friend</button></div></form><div style="margin-top:12px">${(playlist.collaborators || []).map(user => `<div class="friend-card"><div><strong>${safe(user.username)}</strong><p>${safe(userRank(user))}</p></div><button class="danger-button" data-remove-collaborator="${safe(user.id)}">Remove</button></div>`).join("")}</div></section>`);
  $("#edit-playlist-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api(`/api/playlists/${playlist.id}`, { method: "PATCH", body: { ...values, isPublic: values.isPublic === "true" } }); closeModal(); await refreshPlaylists(); openPlaylist(playlist.id); } catch (error) { toast(error.message, "error"); } });
  $("#delete-playlist").addEventListener("click", async () => { if (!confirm("Delete this playlist?")) return; try { await api(`/api/playlists/${playlist.id}`, { method: "DELETE" }); closeModal(); await refreshPlaylists(); navigate("playlists"); } catch (error) { toast(error.message, "error"); } });
  $("#collaborator-form").addEventListener("submit", async event => { event.preventDefault(); try { await api(`/api/playlists/${playlist.id}/collaborators`, { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) }); toast("Collaborator invited"); closeModal(); await openPlaylist(playlist.id); editPlaylist(); } catch (error) { toast(error.message, "error"); } });
}

function addPlaylistSong() {
  const existing = new Set(state.openPlaylist.songs.map(song => song.id));
  showModal(`<h2>Add songs to ${safe(state.openPlaylist.name)}</h2><div class="checkbox-list">${state.songs.filter(song => !existing.has(song.id)).map(song => `<label class="check-song"><img src="${image(song.artworkUrl)}"><input type="checkbox" value="${safe(song.id)}"><span>${safe(song.title)}<br><small>${safe(song.artist || "Unknown artist")}</small></span></label>`).join("")}</div><div class="form-actions"><button class="primary" id="confirm-add-songs">Add selected</button></div>`);
  $("#confirm-add-songs").addEventListener("click", async () => { const ids = $$('.check-song input:checked').map(item => item.value); try { for (const id of ids) await api(`/api/playlists/${state.openPlaylist.id}/songs`, { method: "POST", body: { musicId: id } }); closeModal(); await refreshPlaylists(); openPlaylist(state.openPlaylist.id); toast(`${ids.length} songs added`); } catch (error) { toast(error.message, "error"); } });
}

async function movePlaylistSong(id, direction) {
  const songs = [...state.openPlaylist.songs], index = songs.findIndex(item => item.id === id), target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= songs.length) return; [songs[index], songs[target]] = [songs[target], songs[index]];
  try { await api(`/api/playlists/${state.openPlaylist.id}/order`, { method: "PUT", body: { musicIds: songs.map(item => item.id) } }); state.openPlaylist.songs = songs; await openPlaylist(state.openPlaylist.id); toast("Playlist order saved"); } catch (error) { toast(error.message, "error"); }
}

async function toggleSavePlaylist(playlist) { try { await api(`/api/playlists/${playlist.id}/save`, { method: playlist.saved ? "DELETE" : "POST" }); playlist.saved = !playlist.saved; await refreshPlaylists(); openPlaylist(playlist.id); } catch (error) { toast(error.message, "error"); } }
async function refreshPlaylists() { state.playlists = await api("/api/playlists?library=true"); }

async function renderFriends(tab = "friends") {
  let body = "";
  try {
    if (tab === "friends") {
      state.friends = await api("/api/friends"); renderFriendsPanel();
      body = state.friends.map(friend => `<div class="friend-card profile-link" data-open-user="${safe(friend.id)}">${avatarMarkup(friend, "medium", friend.online)}<div class="friend-copy"><strong>${safe(friend.username)}</strong><p>${friend.listening ? `Listening to ${safe(friend.listening.title)} · ${safe(friend.listening.artist || "Unknown artist")}` : friend.online ? "Online" : "Offline"}</p></div><div class="mini-actions">${friend.listening ? `<button data-join-friend="${safe(friend.id)}">Listen together</button>` : ""}<button data-transfer-friend="${safe(friend.id)}">Send coin</button><button data-remove-friend="${safe(friend.id)}">Remove</button></div></div>`).join("") || '<div class="empty-state">You have no friends yet.</div>';
    } else if (tab === "requests") {
      const requests = await api("/api/friends/requests");
      body = requests.map(request => `<div class="request-item profile-link" data-open-user="${safe(request.sender.id)}">${avatarMarkup(request.sender)}<div class="friend-copy"><strong>${safe(request.sender.username)}</strong><p>Sent you a friend request</p></div><div class="mini-actions"><button data-accept-request="${safe(request.id)}">Accept</button><button data-decline-request="${safe(request.id)}">Decline</button></div></div>`).join("") || '<div class="empty-state">No pending requests.</div>';
    } else if (tab === "charts") {
      const charts = await api("/api/friends/charts"); body = songTable(charts, { source: "charts", label: "Friends' Top Tracks" }); state.friendCharts = charts;
    } else {
      body = `<form id="friend-search-form" class="search-box" style="max-width:none;margin-bottom:18px">${icon("search")}<input id="friend-query" placeholder="Search by username" minlength="2"><button class="primary">Search</button></form><div id="friend-search-results"><div class="empty-state">Search for somebody on F4WE.</div></div>`;
    }
  } catch (error) { body = `<div class="empty-state"><strong>Could not load friends</strong><p>${safe(error.message)}</p></div>`; }
  $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">SOCIAL</p><h1>Friends</h1><p>Listen together, share music and see what your friends love.</p></div></div><div class="tabs"><button class="${tab === "friends" ? "active" : ""}" data-friends-tab="friends">Friends</button><button class="${tab === "search" ? "active" : ""}" data-friends-tab="search">Search</button><button class="${tab === "requests" ? "active" : ""}" data-friends-tab="requests">Requests</button><button class="${tab === "charts" ? "active" : ""}" data-friends-tab="charts">Charts</button></div><div id="friends-body">${body}</div>`;
  $$('[data-friends-tab]').forEach(button => button.addEventListener("click", () => renderFriends(button.dataset.friendsTab)));
  $("#friend-search-form")?.addEventListener("submit", searchFriends);
}

async function searchFriends(event) {
  event.preventDefault(); const q = $("#friend-query").value.trim(); if (q.length < 2) return;
  try { const users = await api(`/api/friends/search?q=${encodeURIComponent(q)}`); $("#friend-search-results").innerHTML = users.map(user => `<div class="friend-card profile-link" data-open-user="${safe(user.id)}">${avatarMarkup(user)}<div class="friend-copy"><strong>${safe(user.username)}</strong><p>${safe(userRank(user))}</p></div><div class="mini-actions">${user.relationship === "none" ? `<button data-send-friend="${safe(user.username)}">Send request</button>` : `<span class="status-chip">${safe(user.relationship)}</span>`}</div></div>`).join("") || '<div class="empty-state">No users found.</div>'; } catch (error) { toast(error.message, "error"); }
}

async function openPublicProfile(userId) {
  navigate("user", true, false); $("#view").innerHTML = '<div class="hero skeleton"></div>';
  try {
    const user = userId === state.user.id ? state.user : await api(`/api/profile/users/${encodeURIComponent(userId)}`);
    state.openUser = user;
    const playlists = user.playlists || (user.id === state.user.id ? state.playlists.filter(item => item.creatorId === state.user.id && item.isPublic) : []);
    $("#view").innerHTML = `<section class="profile-hero public-profile">${user.bannerUrl ? `<img class="profile-hero-bg" src="${image(user.bannerUrl)}" alt="">` : ""}<div class="profile-info">${avatarMarkup(user, "hero")}<div><p class="section-kicker">F4WE PROFILE</p><h1>${safe(user.username)}</h1><p><span class="rank-chip">${safe(userRank(user))}</span> · ID ${safe(user.id)}${user.registrationDate ? ` · Member since ${new Date(user.registrationDate).toLocaleDateString()}` : ""}</p></div></div></section>
      <section class="section"><div class="section-head"><div><p class="section-kicker">PUBLIC COLLECTION</p><h2>${safe(user.username)}'s playlists</h2></div></div><div class="row-cards">${playlists.map(playlistCard).join("") || '<div class="empty-state"><strong>No public playlists</strong><p>This user has not shared a playlist yet.</p></div>'}</div></section>`;
  } catch (error) { $("#view").innerHTML = `<div class="empty-state"><strong>Could not open profile</strong><p>${safe(error.message)}</p></div>`; }
}

function openCoinTransfer(friendId) {
  const friend = state.friends.find(item => item.id === friendId); if (!friend) return;
  showModal(`<h2>Send F4WE COIN</h2><p>Transfer coins to ${safe(friend.username)} from your current balance.</p><form id="coin-transfer-form"><label class="field">Amount<input name="amount" type="number" min="1" step="1" required></label><div class="form-actions"><button class="primary">Send coins</button></div></form>`);
  $("#coin-transfer-form").addEventListener("submit", async event => { event.preventDefault(); const amount = Number(new FormData(event.currentTarget).get("amount")); try { const result = await api("/api/shop/transfer", { method: "POST", body: { friendId, amount } }); if (state.user) state.user.coins = result.coins; closeModal(); toast(`${amount} F4WE COIN sent to ${friend.username}`); } catch (error) { toast(error.message, "error"); } });
}

async function joinFriend(friendId) {
  const friend = state.friends.find(item => item.id === friendId); if (!friend?.listening) return;
  try {
    const songs = await api(`/api/music?ids=${encodeURIComponent(friend.listening.musicId)}`); if (!songs[0]) throw new Error("That song is not available");
    state.followingId = friendId; await playSong(songs[0], songs, { following: true }); audio.currentTime = Math.max(0, friend.listening.position + (friend.listening.playing ? (Date.now() - friend.listening.updatedAt) / 1000 : 0));
    if (!friend.listening.playing) audio.pause();
    window.f4we.presence.emit("listening:join", friendId, result => { if (!result?.ok) toast(result?.error || "Could not join friend", "error"); });
    toast(`Listening together with ${friend.username}`);
  } catch (error) { toast(error.message, "error"); }
}

async function renderActivity(tab = "notifications") {
  let body = "";
  try {
    if (tab === "notifications") {
      state.notifications = await api("/api/profile/notifications"); updateBadges();
      body = `<div class="page-actions" style="justify-content:flex-end;margin-bottom:12px"><button class="secondary" id="mark-read">Mark all read</button><button class="danger-button" id="clear-notifications">Clear all</button></div>${state.notifications.map(item => `<div class="notification-item ${item.read ? "" : "unread"}"><div><strong>${safe(item.title)}</strong><p>${safe(item.body)}</p></div><time>${new Date(item.createdAt).toLocaleDateString()}</time><button class="text-button" data-delete-notification="${safe(item.id)}">Delete</button></div>`).join("") || '<div class="empty-state">No notifications.</div>'}`;
    } else if (tab === "updates") {
      const updates = await api("/api/profile/updates"); body = updates.map(item => `<div class="notification-item"><div><strong>${safe(item.developer?.username || "F4WE Team")}</strong><p>${safe(item.content)}</p></div><time>${new Date(item.postedDate).toLocaleDateString()}</time></div>`).join("") || '<div class="empty-state">No updates yet.</div>';
    } else if (tab === "requests") {
      const requests = await api("/api/profile/requests"); body = `<form id="music-request-form" class="surface"><h3>Request music</h3><label class="field">YouTube or Spotify track URL<input name="sourceUrl" type="url" required></label><div class="form-actions"><button class="primary">Send request</button></div></form>${requests.map(item => `<div class="request-item"><div><strong>${safe(item.requestedTitle || item.songsRequested || "Music request")}</strong><p>${safe(item.status)}${item.rejectionReason ? ` · ${safe(item.rejectionReason)}` : ""}</p></div><time>${new Date(item.requestDate).toLocaleDateString()}</time><button class="text-button" data-delete-request="${safe(item.id)}">Delete</button></div>`).join("")}`;
    } else if (tab === "bugs") {
      const bugs = await api("/api/profile/bugs"); body = `<form id="bug-form" class="surface"><h3>Report a bug</h3><label class="field">What happened?<textarea name="description" minlength="10" required></textarea></label><div class="form-actions"><button class="primary">Send report</button></div></form>${bugs.map(item => `<div class="request-item"><div><strong>${safe(item.description)}</strong><p>${safe(item.status)}${item.adminResponse ? ` · ${safe(item.adminResponse)}` : ""}</p></div><button class="text-button" data-delete-bug="${safe(item.id)}">Delete</button></div>`).join("")}`;
    } else {
      const ideas = await api("/api/profile/update-ideas"); body = `<form id="idea-form" class="surface"><h3>Share an update idea</h3><label class="field">Your idea<textarea name="content" minlength="5" required></textarea></label><div class="form-actions"><button class="primary">Send idea</button></div></form>${ideas.map(item => `<div class="request-item"><div><strong>${safe(item.content)}</strong><p>${safe(item.user?.username || "F4WE user")}</p></div><button class="text-button" data-delete-idea="${safe(item.id)}">Delete</button></div>`).join("")}`;
    }
  } catch (error) { body = `<div class="empty-state"><strong>Could not load activity</strong><p>${safe(error.message)}</p></div>`; }
  $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">F4WE CENTER</p><h1>Activity</h1><p>Notifications, updates and your requests.</p></div></div><div class="tabs">${[["notifications","Notifications"],["updates","Updates"],["requests","Music requests"],["bugs","Bug reports"],["ideas","Ideas"]].map(([id,label]) => `<button class="${tab === id ? "active" : ""}" data-activity-tab="${id}">${label}</button>`).join("")}</div>${body}`;
  $$('[data-activity-tab]').forEach(button => button.addEventListener("click", () => renderActivity(button.dataset.activityTab)));
  $("#mark-read")?.addEventListener("click", async () => { await api("/api/profile/notifications/read", { method: "POST", body: { ids: state.notifications.map(item => item.id) } }); renderActivity(); });
  $("#clear-notifications")?.addEventListener("click", async () => { await api("/api/profile/notifications", { method: "DELETE" }); renderActivity(); });
  $("#music-request-form")?.addEventListener("submit", event => submitSimpleForm(event, "/api/profile/requests", "Music request sent", () => renderActivity("requests")));
  $("#bug-form")?.addEventListener("submit", event => submitSimpleForm(event, "/api/profile/bugs", "Bug report sent", () => renderActivity("bugs")));
  $("#idea-form")?.addEventListener("submit", event => submitSimpleForm(event, "/api/profile/update-ideas", "Idea sent", () => renderActivity("ideas")));
}

async function submitSimpleForm(event, route, message, done) { event.preventDefault(); const body = Object.fromEntries(new FormData(event.currentTarget)); try { await api(route, { method: "POST", body }); toast(message); done(); } catch (error) { toast(error.message, "error"); } }

async function renderProfile() {
  $("#view").innerHTML = '<div class="hero skeleton"></div>';
  try {
    const [stats, recap] = await Promise.all([api("/api/profile/me/listening-stats"), api("/api/profile/me/recap")]);
    $("#view").innerHTML = `<section class="profile-hero">${state.user.bannerUrl ? `<img class="profile-hero-bg" src="${image(state.user.bannerUrl)}">` : ""}<div class="profile-info">${avatarMarkup(state.user, "hero")}<div><p class="section-kicker">PROFILE</p><h1>${safe(state.user.username)}</h1><p><span class="rank-chip">${safe(userRank())}</span> · ID ${safe(state.user.id)} · Member since ${new Date(state.user.registrationDate).toLocaleDateString()}</p></div></div></section>
      <div class="stats-grid"><div class="stat-card"><span>F4WE COIN</span><strong>${state.user.coins || 0}</strong></div><div class="stat-card"><span>Listening time</span><strong>${formatLongTime(stats.totalSeconds)}</strong></div><div class="stat-card"><span>Plays</span><strong>${stats.playCount}</strong></div><div class="stat-card"><span>${recap.year} top tracks</span><strong>${recap.topSongs.length}</strong></div></div>
      <section class="section"><div class="section-head"><div><p class="section-kicker">YEAR IN MUSIC</p><h2>${recap.year} Recap</h2></div></div>${songTable(recap.topSongs, { source: "recap", label: `${recap.year} Recap` })}</section>`;
    state.recapSongs = recap.topSongs;
  } catch (error) { toast(error.message, "error"); }
}

async function renderShop() {
  $("#settings-panel").innerHTML = '<div class="surface skeleton" style="height:260px"></div>';
  try {
    const shop = await api("/api/shop"); state.shop = shop;
    $("#settings-panel").innerHTML = `<section class="settings-section"><div class="page-head"><div><h2>F4WE Shop</h2><p>Unlock account features and profile designs.</p></div><span class="coin-balance">◆ ${shop.user.coins} F4WE COIN</span></div><div class="shop-grid">${shop.products.map(product => `<div class="shop-card"><h3>${safe(product.name)}</h3><p>${safe(product.description)}</p><strong>${product.price} COIN</strong>${product.active ? `<button class="secondary" data-buy-product="${safe(product.key)}">Buy</button>` : '<button class="secondary" disabled>Unavailable</button>'}</div>`).join("")}</div></section>
      <section class="settings-section"><h2>Profile designs</h2><p>Purchased designs remain yours even if they leave the shop.</p><div class="shop-grid">${shop.designs.map(design => `<div class="shop-card"><img src="${image(design.assetUrl)}" style="width:100%;aspect-ratio:1;object-fit:contain"><h3>${safe(design.name)} ${design.isLimited ? "· LIMITED" : ""}</h3><strong>${design.owned ? "OWNED" : `${design.price} COIN`}</strong><button class="secondary" ${design.using ? "data-unuse-design" : design.owned ? `data-use-design="${safe(design.id)}"` : `data-buy-design="${safe(design.id)}"`}>${design.using ? "Remove" : design.owned ? "Use" : "Buy"}</button></div>`).join("")}</div></section>`;
  } catch (error) { $("#settings-panel").innerHTML = `<div class="empty-state">${safe(error.message)}</div>`; }
}

function settingsMenu() {
  const items = [["account","Account"],["playback","Playback & privacy"],["shop","F4WE Shop"],["about","About F4WE"]];
  if (isStaff(state.user)) items.splice(3, 0, ["staff","Staff Portal"]);
  if (isDeveloper(state.user)) items.splice(items.length - 1, 0, ["developer","Developer Portal"]);
  if (state.user.isOwner) items.splice(items.length - 1, 0, ["owner","Owner Portal"]);
  return items.map(([id,label]) => `<button class="${state.settingsTab === id ? "active" : ""} ${["staff","developer","owner"].includes(id) ? "staff-setting" : ""}" data-settings-tab="${id}">${label}</button>`).join("");
}

function renderSettings(tab = state.settingsTab) {
  state.settingsTab = tab;
  $("#view").innerHTML = `<div class="page-head"><div><p class="section-kicker">F4WE DESKTOP</p><h1>Settings</h1><p>Manage your account, music and staff tools.</p></div></div><div class="settings-layout"><aside class="settings-menu">${settingsMenu()}</aside><div id="settings-panel" class="settings-content"></div></div>`;
  $$('[data-settings-tab]').forEach(button => button.addEventListener("click", () => renderSettings(button.dataset.settingsTab)));
  if (tab === "account") renderAccountSettings();
  else if (tab === "playback") renderPlaybackSettings();
  else if (tab === "shop") void renderShop();
  else if (tab === "staff") void renderStaffSettings();
  else if (tab === "developer") renderDeveloperSettings();
  else if (tab === "owner") void renderOwnerSettings();
  else renderAboutSettings();
}

function renderAccountSettings() {
  $("#settings-panel").innerHTML = `<section class="settings-section"><h2>Public profile</h2><p>Your changes are shared with the mobile app immediately.</p><form id="username-form"><div class="form-grid"><label class="field">Username<input name="username" value="${safe(state.user.username)}" pattern="[A-Za-z0-9_.-]+" minlength="3" required></label><label class="field">Application ID<input value="${safe(state.user.id)}" disabled></label></div><div class="form-actions"><button class="primary">Save username</button></div></form></section>
    <section class="settings-section"><h2>Profile images</h2><p>Use the same avatar and banner everywhere in F4WE.</p><div class="form-grid"><button class="file-picker" id="upload-avatar">Choose profile picture</button><button class="file-picker" id="upload-banner">Choose profile banner</button></div></section>
    <section class="settings-section"><h2>Session</h2><div class="toggle-row"><div><strong>Signed in as ${safe(state.user.username)}</strong><p>${safe(userRank())} · F4WE ID ${safe(state.user.id)}</p></div><button class="danger-button" id="settings-logout">Sign out</button></div></section>`;
  $("#username-form").addEventListener("submit", async event => { event.preventDefault(); try { state.user = { ...state.user, ...await api("/api/profile/me", { method: "PATCH", body: Object.fromEntries(new FormData(event.currentTarget)) }) }; updateUserChrome(); toast("Username updated"); } catch (error) { toast(error.message, "error"); } });
  $("#upload-avatar").addEventListener("click", () => uploadProfileImage("picture")); $("#upload-banner").addEventListener("click", () => uploadProfileImage("banner")); $("#settings-logout").addEventListener("click", () => logout());
}

async function uploadProfileImage(kind) {
  const result = await window.f4we.pickAndUpload({ accept: "image", title: kind === "picture" ? "Choose profile picture" : "Choose banner", startPath: `/api/profile/me/${kind}/upload-url`, completePath: `/api/profile/me/${kind}/complete` });
  if (result.canceled) return; if (!result.ok) return toast(uploadError(result), "error");
  if (kind === "picture") state.user.profilePicture = result.data.profilePicture; else state.user.bannerUrl = result.data.bannerUrl;
  updateUserChrome(); toast("Profile updated"); renderAccountSettings();
}

function renderPlaybackSettings() {
  $("#settings-panel").innerHTML = `<section class="settings-section"><h2>Playback</h2><p>Desktop player behavior.</p><div class="toggle-row"><div><strong>Shuffle</strong><p>Play the current queue in a random order.</p></div><button class="toggle ${state.shuffle ? "on" : ""}" id="settings-shuffle"></button></div><div class="toggle-row"><div><strong>Repeat current song</strong><p>Keep replaying the active track.</p></div><button class="toggle ${state.repeat ? "on" : ""}" id="settings-repeat"></button></div></section>
    <section class="settings-section"><h2>Listening privacy</h2><p>Friends can see and join what you are currently playing.</p><div class="toggle-row"><div><strong>Share listening activity</strong><p>Turn this off to listen privately.</p></div><button class="toggle ${state.user.shareListening ? "on" : ""}" id="privacy-toggle"></button></div></section>`;
  $("#settings-shuffle").addEventListener("click", toggleShuffle); $("#settings-repeat").addEventListener("click", toggleRepeat);
  $("#privacy-toggle").addEventListener("click", async () => { try { const value = !state.user.shareListening; await api("/api/profile/me/listening-privacy", { method: "PATCH", body: { shareListening: value } }); state.user.shareListening = value; window.f4we.presence.emit("listening:privacy", value); renderPlaybackSettings(); } catch (error) { toast(error.message, "error"); } });
}

async function loadCatalogSongs(force = false) {
  if (!force && state.catalogSongs.length) return state.catalogSongs;
  state.catalogSongs = await api("/api/artists/manage/songs");
  return state.catalogSongs;
}

function trackPickerMarkup(songs, selectedIds = [], prefix = "release") {
  const selected = new Set(selectedIds);
  return `<div class="field full track-picker"><span>Select tracks</span><div class="track-search"><input id="${safe(prefix)}-track-search" type="search" placeholder="Search by song or artist"><b id="${safe(prefix)}-track-count">${songs.length} songs</b></div><div class="checkbox-list" id="${safe(prefix)}-track-list">${songs.map(song => `<label class="check-song" data-track-search="${safe(`${song.title} ${song.artist || ""}`.toLocaleLowerCase("en-US"))}"><img src="${image(song.artworkUrl)}"><input type="checkbox" name="songId" value="${safe(song.id)}" ${selected.has(song.id) ? "checked" : ""}><span>${safe(song.title)}<br><small>${safe(song.artist || "Unknown artist")}</small></span></label>`).join("")}</div></div>`;
}

function wireTrackSearch(prefix) {
  const input = $(`#${CSS.escape(prefix)}-track-search`), list = $(`#${CSS.escape(prefix)}-track-list`), count = $(`#${CSS.escape(prefix)}-track-count`);
  if (!input || !list) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLocaleLowerCase("en-US"); let visible = 0;
    $$(".check-song", list).forEach(item => { const show = !query || item.dataset.trackSearch.includes(query); item.classList.toggle("hidden", !show); if (show) visible++; });
    if (count) count.textContent = `${visible} of ${$$('.check-song', list).length} songs`;
  });
}

async function renderStaffSettings() {
  $("#settings-panel").innerHTML = '<div class="surface skeleton" style="height:320px"></div>';
  let songs;
  try { songs = await loadCatalogSongs(true); }
  catch (error) { $("#settings-panel").innerHTML = `<div class="empty-state"><strong>Could not load the staff catalog</strong><p>${safe(error.message)}</p></div>`; return; }
  if (state.view !== "settings" || state.settingsTab !== "staff") return;
  $("#settings-panel").innerHTML = `<section class="settings-section"><h2>Add artist</h2><p>Create an official artist profile visible in search, albums and music pages.</p><form id="artist-form"><div class="form-grid"><label class="field">Artist name<input name="name" maxlength="120" required></label><label class="field full">Biography<textarea name="bio" maxlength="2000"></textarea></label><button type="button" class="file-picker" id="artist-image">Choose artist image</button><button type="button" class="file-picker" id="artist-banner">Choose artist banner</button></div><div id="artist-image-status"></div><div id="artist-banner-status"></div><div class="form-actions"><button class="primary">Add artist</button></div></form></section>
    <section class="settings-section"><h2>Add album</h2><p>Add an Album, EP or Single to an artist and connect any existing F4WE song.</p><form id="release-form"><div class="form-grid"><label class="field">Artist<select name="artistId" required><option value="">Choose artist</option>${state.artists.map(item => `<option value="${safe(item.id)}">${safe(item.name)}</option>`).join("")}</select></label><label class="field">Title<input name="title" maxlength="150" required></label><label class="field">Type<select name="type"><option>Album</option><option>EP</option><option>Single</option></select></label><label class="field">Release date<input name="releaseDate" type="date"></label><label class="field full">Description<textarea name="description"></textarea></label><button type="button" class="file-picker full" id="release-image">Choose album cover</button>${trackPickerMarkup(songs, [], "release")}</div><div id="release-image-status"></div><div class="form-actions"><button class="primary">Add album</button></div></form></section>
    <section class="settings-section"><h2>Music upload</h2><p>Upload a verified MP3 directly to the same R2 storage used by mobile.</p><form id="music-upload-form"><div class="form-grid"><label class="field">Title<input name="title" required></label><label class="field">Artist<input name="artist"></label><label class="field">Release date<input name="releaseDate" type="date"></label></div><div class="form-actions"><button class="primary">Choose MP3 and upload</button></div></form></section>
    <section class="settings-section"><h2>Music Manager</h2><p>Edit metadata, artwork, lyrics, audio cuts or remove a song.</p><div id="music-manager-list">${state.songs.slice(0, 100).map(song => `<div class="friend-card"><div class="friend-avatar"><img src="${image(song.artworkUrl)}"></div><div><strong>${safe(song.title)}</strong><p>${safe(song.artist || "Unknown artist")} · ${formatTime(song.duration)}</p></div><div class="mini-actions"><button data-manage-song="${safe(song.id)}">Manage</button></div></div>`).join("")}</div></section>
    ${["Admin","Developer"].includes(state.user.rank) || state.user.isOwner ? '<section class="settings-section"><h2>Request moderation</h2><p>Review active music requests and bug reports.</p><button class="secondary" id="load-moderation">Load moderation queue</button><div id="moderation-list" style="margin-top:15px"></div></section>' : ""}`;
  wireTrackSearch("release");
  $("#artist-image").addEventListener("click", () => uploadCatalogAsset("artist", "portrait")); $("#artist-banner").addEventListener("click", () => uploadCatalogAsset("artist", "banner")); $("#release-image").addEventListener("click", () => uploadCatalogAsset("release-artwork", "release"));
  $("#artist-form").addEventListener("submit", createArtist); $("#release-form").addEventListener("submit", createRelease); $("#music-upload-form").addEventListener("submit", uploadMusic);
  $("#load-moderation")?.addEventListener("click", loadStaffModeration);
}

async function uploadCatalogAsset(category, target) {
  const title = target === "banner" ? "Choose artist banner" : category === "artist" ? "Choose artist image" : "Choose album cover";
  const url = await pickCatalogAsset(category, title); if (!url) return;
  if (target === "portrait") { state.selectedArtistImage = url; $("#artist-image-status").innerHTML = `<p>✓ Artist image ready</p>`; }
  else if (target === "banner") { state.selectedArtistHero = url; $("#artist-banner-status").innerHTML = `<p>✓ Artist banner ready</p>`; }
  else { state.selectedReleaseImage = url; $("#release-image-status").innerHTML = `<p>✓ Album cover ready</p>`; }
}

async function createArtist(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  try { await api("/api/artists", { method: "POST", body: { ...values, imageUrl: state.selectedArtistImage || undefined, heroUrl: state.selectedArtistHero || undefined } }); state.selectedArtistImage = null; state.selectedArtistHero = null; state.artists = await api("/api/artists"); toast("Artist added to F4WE"); renderSettings("staff"); } catch (error) { toast(error.message, "error"); }
}

async function createRelease(event) {
  event.preventDefault(); const form = new FormData(event.currentTarget); const artistId = form.get("artistId"); const songIds = form.getAll("songId");
  try { await api(`/api/artists/${encodeURIComponent(artistId)}/releases`, { method: "POST", body: { title: form.get("title"), type: form.get("type"), description: form.get("description") || undefined, releaseDate: form.get("releaseDate") || undefined, artworkUrl: state.selectedReleaseImage || undefined, songIds } }); state.selectedReleaseImage = null; [state.artists, state.releases] = await Promise.all([api("/api/artists"), api("/api/artists/releases")]); toast("Album added to F4WE"); renderSettings("staff"); } catch (error) { toast(error.message, "error"); }
}

async function uploadMusic(event) {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  const result = await window.f4we.pickAndUpload({ accept: "audio", title: "Choose MP3", startPath: "/api/music/upload/upload-url", completePath: "/api/music/upload/complete", completePayload: { title: values.title, artist: values.artist || undefined, releaseDate: values.releaseDate || undefined, confirmDuplicate: false } });
  if (result.canceled) return; if (!result.ok) return toast(uploadError(result, "Music upload failed"), "error"); state.songs.unshift(result.data); toast("Music uploaded"); event.currentTarget.reset();
}

function manageSong(songId) {
  const song = state.songs.find(item => item.id === songId); if (!song) return;
  showModal(`<p class="section-kicker">MUSIC MANAGER</p><h2>${safe(song.title)}</h2><form id="song-edit-form"><div class="form-grid"><label class="field">Title<input name="title" value="${safe(song.title)}" required></label><label class="field">Artist<input name="artist" value="${safe(song.artist || "")}"></label><label class="field">Release date<input name="releaseDate" type="date" value="${safe(song.releaseDate?.slice(0,10) || "")}"></label></div><div class="form-actions"><button class="primary">Save metadata</button><button type="button" class="secondary" id="song-artwork-upload">Change artwork</button></div></form>
    <section class="section"><h3>Lyrics</h3><form id="song-lyrics-form"><label class="field">Lyrics type<select name="type"><option value="plain" ${!song.lyricsSynced ? "selected" : ""}>Plain TXT</option><option value="timed" ${song.lyricsSynced ? "selected" : ""}>Timed LRC</option></select></label><label class="field">Lyrics<textarea name="content" placeholder="Paste TXT text or timed [mm:ss.xx] LRC lines"></textarea></label><div class="form-actions"><button class="secondary">Save lyrics</button></div></form></section>
    <section class="section"><h3>Cut music</h3><form id="song-cut-form"><div class="form-grid"><label class="field">Start second<input name="startSeconds" type="number" min="0" max="86400" step="0.1" value="0" required></label><label class="field">End second<input name="endSeconds" type="number" min="1" max="86400" step="0.1" value="${song.duration || 1}" required></label></div><div class="form-actions"><button class="secondary">Cut and replace MP3</button>${["Admin","Developer"].includes(state.user.rank) || state.user.isOwner ? '<button type="button" class="danger-button" id="delete-song">Delete song</button>' : ""}</div></form></section>`);
  $("#song-edit-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { const updated = await api(`/api/music/${song.id}`, { method: "PATCH", body: { title: values.title, artist: values.artist || null, releaseDate: values.releaseDate || null } }); Object.assign(song, updated); closeModal(); toast("Song updated"); renderSettings("staff"); } catch (error) { toast(error.message, "error"); } });
  $("#song-artwork-upload").addEventListener("click", async () => { const result = await window.f4we.pickAndUpload({ accept: "image", title: "Choose song artwork", startPath: `/api/music/${song.id}/picture/upload-url`, completePath: `/api/music/${song.id}/picture/complete` }); if (result.canceled) return; if (!result.ok) return toast(uploadError(result, "Artwork upload failed"), "error"); song.artworkUrl = result.data.artworkUrl; toast("Artwork updated"); });
  $("#song-lyrics-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api(`/api/music/${song.id}/lyrics`, { method: "PUT", body: values }); song.hasLyrics = true; song.lyricsSynced = values.type === "timed"; toast("Lyrics saved"); } catch (error) { toast(error.message, "error"); } });
  $("#song-cut-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); if (!confirm("Cut and replace this MP3?")) return; try { const updated = await api(`/api/music/${song.id}/cut`, { method: "POST", body: { startSeconds: Number(values.startSeconds), endSeconds: Number(values.endSeconds) } }); Object.assign(song, updated); toast("Music cut saved"); closeModal(); renderSettings("staff"); } catch (error) { toast(error.message, "error"); } });
  $("#delete-song")?.addEventListener("click", async () => { if (!confirm("Delete this song from F4WE?")) return; try { await api(`/api/music/${song.id}`, { method: "DELETE" }); state.songs = state.songs.filter(item => item.id !== song.id); closeModal(); renderSettings("staff"); toast("Song deleted"); } catch (error) { toast(error.message, "error"); } });
}

async function loadStaffModeration() {
  try {
    const [requests, bugs] = await Promise.all([api("/api/profile/staff/requests"), api("/api/profile/staff/bugs")]);
    $("#moderation-list").innerHTML = `<h3>Music requests</h3>${requests.filter(item => ["Pending","Processing"].includes(item.status)).map(item => `<div class="request-item"><div><strong>${safe(item.songsRequested)}</strong><p>${safe(item.user.username)} · ${safe(item.status)}</p></div><div class="mini-actions"><button data-review-request="${safe(item.id)}" data-review-status="Accepted">Accept</button><button data-review-request="${safe(item.id)}" data-review-status="Rejected">Reject</button></div></div>`).join("") || '<p>No active requests.</p>'}<h3>Bug reports</h3>${bugs.filter(item => !["Fixed","Rejected"].includes(item.status)).map(item => `<div class="request-item"><div><strong>${safe(item.description)}</strong><p>${safe(item.user.username)} · ${safe(item.status)}</p></div><div class="mini-actions"><button data-review-bug="${safe(item.id)}" data-review-status="Fixed">Fixed</button><button data-review-bug="${safe(item.id)}" data-review-status="Rejected">Reject</button></div></div>`).join("") || '<p>No active bug reports.</p>'}`;
  } catch (error) { toast(error.message, "error"); }
}

function renderDeveloperSettings() {
  $("#settings-panel").innerHTML = `<section class="settings-section"><h2>Developer Portal</h2><p>Search users and manage application access.</p><form id="developer-search" class="search-box" style="max-width:none">${icon("search")}<input name="q" placeholder="Username or application ID"><button class="primary">Search</button></form><div id="developer-users" style="margin-top:16px"></div></section><section class="settings-section"><h2>Publish update</h2><p>Post public release notes in the app's Updates tab.</p><form id="publish-update-form"><label class="field">Update text<textarea name="content" minlength="1" maxlength="5000" required></textarea></label><div class="form-actions"><button class="primary">Publish update</button></div></form></section>`;
  $("#developer-search").addEventListener("submit", async event => { event.preventDefault(); const q = new FormData(event.currentTarget).get("q"); try { const users = await api(`/api/developer/users?q=${encodeURIComponent(q)}`); $("#developer-users").innerHTML = users.map(user => `<div class="friend-card"><div class="friend-avatar"><img src="${image(user.profilePicture)}"></div><div><strong>${safe(user.username)}</strong><p>${safe(user.id)} · ${safe(userRank(user))}</p></div><div class="mini-actions"><button data-copy-id="${safe(user.id)}">Copy ID</button>${!user.isOwner ? `<button data-edit-rank="${safe(user.id)}">Edit rank</button>` : ""}</div></div>`).join(""); state.developerUsers = users; } catch (error) { toast(error.message, "error"); } });
  $("#publish-update-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/profile/updates", { method: "POST", body: Object.fromEntries(new FormData(event.currentTarget)) }); event.currentTarget.reset(); toast("Update published"); } catch (error) { toast(error.message, "error"); } });
}

async function renderOwnerSettings() {
  $("#settings-panel").innerHTML = '<div class="surface skeleton" style="height:300px"></div>';
  try {
    const [system, stats, shop] = await Promise.all([api("/api/system/status"), api("/api/developer/staff-stats"), api("/api/shop?manage=true")]);
    $("#settings-panel").innerHTML = `<section class="settings-section"><h2>Application control</h2><p>Require updates or temporarily place selected F4WE platforms into maintenance mode.</p><form id="system-form"><div class="form-grid"><label class="field">Minimum version<input name="minimumVersion" value="${safe(system.minimumVersion)}" required></label><label class="field full">Update message<textarea name="updateMessage">${safe(system.updateMessage)}</textarea></label><label class="field full">Maintenance message<textarea name="maintenanceMessage">${safe(system.maintenanceMessage)}</textarea></label></div><div class="toggle-row"><div><strong>Maintenance break</strong><p>Only blocks the platforms selected below.</p></div><button type="button" class="toggle ${system.maintenanceEnabled ? "on" : ""}" id="maintenance-toggle"></button></div><div class="platform-options"><label class="check-song"><input type="checkbox" name="maintenanceAndroid" ${system.maintenancePlatforms?.android !== false ? "checked" : ""}> Android</label><label class="check-song"><input type="checkbox" name="maintenanceWindows" ${system.maintenancePlatforms?.windows !== false ? "checked" : ""}> Windows 10/11</label></div><label class="check-song"><input type="checkbox" name="announceUpdate"> Send an update notification to users</label><div class="form-actions"><button class="primary">Save system settings</button></div></form></section>
      <section class="settings-section"><h2>Notification Send</h2><p>Send a one-time message that appears when users enter F4WE.</p><form id="owner-announcement-form"><div class="form-grid"><label class="field full">Title<input name="title" maxlength="120" required></label><label class="field full">Message<textarea name="body" maxlength="2000" required></textarea></label></div><div class="platform-options"><label class="check-song"><input type="checkbox" name="android" checked> Android</label><label class="check-song"><input type="checkbox" name="windows" checked> Windows 10/11</label></div><div class="form-actions"><button class="primary">Send notification</button></div></form></section>
      <section class="settings-section"><h2>F4WE COIN manager</h2><form id="coin-owner-form"><div class="form-grid"><label class="field">User ID<input name="userId" pattern="\\d{1,16}" required></label><label class="field">Amount (negative removes)<input name="amount" type="number" step="1" required></label></div><div class="form-actions"><button class="primary">Update balance</button></div></form></section>
      <section class="settings-section"><h2>Reward settings</h2><form id="reward-owner-form"><div class="form-grid"><label class="field">Minutes per reward<input name="intervalMinutes" type="number" min="1" value="${Math.round(shop.rewardSettings.intervalSeconds / 60)}" required></label><label class="field">Coins per reward<input name="coinAmount" type="number" min="1" value="${shop.rewardSettings.coinAmount}" required></label></div><div class="form-actions"><button class="primary">Save reward settings</button></div></form></section>
      <section class="settings-section"><h2>Shop products</h2><p>Change prices or temporarily disable the three built-in products.</p>${shop.products.map(product => `<div class="toggle-row"><div><strong>${safe(product.name)}</strong><p>${safe(product.description)}</p></div><div class="mini-actions"><input class="inline-input" id="product-price-${safe(product.key)}" type="number" min="0" value="${product.price}" style="width:95px;margin:0"><button data-owner-product="${safe(product.key)}" data-product-active="${product.active}">${product.active ? "Save / disable" : "Save / enable"}</button></div></div>`).join("")}</section>
      <section class="settings-section"><h2>Profile design upload</h2><form id="design-owner-form"><div class="form-grid"><label class="field">Design name<input name="name" required></label><label class="field">Price<input name="price" type="number" min="0" required></label><label class="check-song"><input name="isLimited" type="checkbox"> Limited Edition</label></div><div class="form-actions"><button class="primary">Choose image/GIF and add</button></div></form></section>
      <section class="settings-section"><h2>Account security tools</h2><p>Change an application ID or reset a user's password and invalidate existing sessions.</p><form id="app-id-owner-form"><div class="form-grid"><label class="field">Current App ID<input name="oldId" pattern="\\d{1,16}" required></label><label class="field">New App ID<input name="newId" pattern="\\d{1,16}" required></label></div><div class="form-actions"><button class="secondary">Change App ID</button></div></form><form id="password-owner-form" style="margin-top:22px"><div class="form-grid"><label class="field">User App ID<input name="userId" pattern="\\d{1,16}" required></label><label class="field">New password<input name="password" type="password" minlength="8" required></label></div><div class="form-actions"><button class="danger-button">Reset password</button></div></form></section>
      <section class="settings-section"><h2>Staff statistics</h2>${stats.map(item => `<div class="friend-card"><div class="friend-avatar"><img src="${image(item.profilePicture)}"></div><div><strong>${safe(item.username)}</strong><p>${safe(userRank(item))}</p></div><span class="status-chip">${item.uploadedCount} uploads</span></div>`).join("")}</section>`;
    let maintenance = system.maintenanceEnabled;
    $("#maintenance-toggle").addEventListener("click", event => { maintenance = !maintenance; event.currentTarget.classList.toggle("on", maintenance); });
    $("#system-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/system/status", { method: "PATCH", body: { minimumVersion: values.minimumVersion, updateMessage: values.updateMessage, maintenanceMessage: values.maintenanceMessage, maintenanceEnabled: maintenance, maintenancePlatforms: { android: values.maintenanceAndroid === "on", windows: values.maintenanceWindows === "on" }, announceUpdate: values.announceUpdate === "on" } }); toast("System settings updated"); } catch (error) { toast(error.message, "error"); } });
    $("#owner-announcement-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const platforms = [values.android === "on" ? "android" : null, values.windows === "on" ? "windows" : null].filter(Boolean); if (!platforms.length) return toast("Select Android, Windows 10/11, or both", "error"); try { await api("/api/system/announcements", { method: "POST", body: { title: values.title, body: values.body, platforms } }); event.currentTarget.reset(); toast("Notification sent"); } catch (error) { toast(error.message, "error"); } });
    $("#coin-owner-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { const result = await api("/api/shop/owner/coins", { method: "POST", body: { userId: values.userId, amount: Number(values.amount) } }); toast(`${result.username}: ${result.coins} F4WE COIN`); } catch (error) { toast(error.message, "error"); } });
    $("#reward-owner-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api("/api/shop/owner/reward-settings", { method: "PATCH", body: { intervalMinutes: Number(values.intervalMinutes), coinAmount: Number(values.coinAmount) } }); toast("Reward settings saved"); } catch (error) { toast(error.message, "error"); } });
    $("#design-owner-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const result = await window.f4we.pickAndUpload({ accept: "image", title: "Choose profile design", startPath: "/api/shop/owner/designs/upload-url", completePath: "/api/shop/owner/designs/complete", completePayload: { name: values.name, price: Number(values.price), isLimited: values.isLimited === "on" } }); if (result.canceled) return; if (!result.ok) return toast(uploadError(result, "Design upload failed"), "error"); toast("Profile design added"); renderOwnerSettings(); });
    $("#app-id-owner-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); try { await api(`/api/developer/users/${values.oldId}/app-id`, { method: "PATCH", body: { newId: values.newId } }); toast("Application ID updated"); } catch (error) { toast(error.message, "error"); } });
    $("#password-owner-form").addEventListener("submit", async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); if (!confirm("Reset this user's password?")) return; try { const result = await api(`/api/developer/users/${values.userId}/password`, { method: "PATCH", body: { password: values.password } }); toast(`${result.username}'s password was reset`); event.currentTarget.reset(); } catch (error) { toast(error.message, "error"); } });
  } catch (error) { $("#settings-panel").innerHTML = `<div class="empty-state">${safe(error.message)}</div>`; }
}

function renderAboutSettings() { $("#settings-panel").innerHTML = `<section class="settings-section"><h2>F4WE for Windows</h2><p>The full desktop version of your F4WE community, powered by the same API, PostgreSQL database and R2 library as mobile.</p><div class="toggle-row"><div><strong>Owned by</strong><p>This app is Owned By notxenom1</p></div><span class="status-chip">F4WE</span></div><div class="toggle-row"><div><strong>Version</strong><p>${safe(state.config.version)}</p></div><span class="status-chip">CURRENT</span></div><div class="toggle-row"><div><strong>Website</strong><p>Download updates and invite friends.</p></div><button class="secondary" id="open-site">Open f4we.xyz</button></div></section>`; $("#open-site").addEventListener("click", () => window.f4we.openExternal("https://f4we.xyz/")); }

function queueFor(source) {
  if (source === "favorites") return state.favorites;
  if (source === "playlist") return state.openPlaylist?.songs || [];
  if (source === "release") return state.openRelease?.tracks || [];
  if (source === "artist") return state.openArtist?.music || [];
  if (source === "charts") return state.friendCharts || [];
  if (source === "recap") return state.recapSongs || [];
  if (source === "search") return state.searchSongs || [];
  if (source === "home-rotation") return state.homeRotation || state.rotation || [];
  if (source === "home-recent") return state.homeRecent || [];
  if (source === "home-featured") return state.homeFeatured || state.songs;
  return state.songs;
}

function findSongById(id) {
  const collections = [
    state.queue, state.songs, state.rotation, state.favorites, state.searchSongs, state.homeRecent, state.homeFeatured,
    state.openPlaylist?.songs, state.openRelease?.tracks, state.openArtist?.music, state.friendCharts, state.recapSongs
  ];
  for (const collection of collections) {
    const song = collection?.find?.(item => item.id === id);
    if (song) return song;
  }
  return null;
}

async function playSong(song, queue = state.songs, options = {}) {
  if (!song?.id) return;
  const requestId = ++state.playbackRequest;
  await stopHeartbeat(true);
  if (requestId !== state.playbackRequest) return;
  if (!options.following && state.followingId) { window.f4we.presence.emit("listening:leave"); state.followingId = null; }
  state.queue = queue.some(item => item.id === song.id) ? [...queue] : [song, ...queue];
  state.queueIndex = state.queue.findIndex(item => item.id === song.id); state.active = song;
  audio.pause();
  audio.src = `f4we-media://music/${encodeURIComponent(song.id)}`; audio.load(); updatePlayerChrome();
  rememberRecent(song.id);
  try { await audio.play(); }
  catch (error) {
    const interrupted = error?.name === "AbortError" || /play\(\) request was interrupted by a new load request/i.test(String(error?.message || error));
    if (requestId !== state.playbackRequest || interrupted) return;
    toast(`Playback failed: ${error.message}`, "error"); return;
  }
  if (requestId !== state.playbackRequest) return;
  try { const result = await api(`/api/music/${encodeURIComponent(song.id)}/play`, { method: "POST" }); if (requestId !== state.playbackRequest) return; state.playId = result.id; } catch { if (requestId !== state.playbackRequest) return; state.playId = null; }
  startHeartbeat(); publishPresence(); renderPlayerSensitiveView();
}

function updatePlayerChrome() {
  const song = state.active; $("#player-title").textContent = song?.title || "Choose a song"; $("#player-artist").textContent = song?.artist || "F4WE"; $("#player-artwork").src = song?.artworkUrl || fallbackArt;
  $("#play-button").innerHTML = icon(audio.paused ? "play" : "pause"); $("#like-current").classList.toggle("active", !!song && state.favorites.some(item => item.id === song.id)); $("#like-current").innerHTML = icon("heart");
  $("#shuffle-button").classList.toggle("active", state.shuffle); $("#repeat-button").classList.toggle("active", state.repeat);
  window.f4we.mediaControls?.update({ active: !!song, playing: !!song && !audio.paused });
}

function collectRewardTime() {
  if (!state.rewardStartedAt) return;
  const now = Date.now(); state.rewardPendingMs += Math.max(0, now - state.rewardStartedAt); state.rewardStartedAt = audio.paused ? null : now;
}

async function flushHeartbeat() {
  collectRewardTime();
  const seconds = Math.floor(state.rewardPendingMs / 1000);
  if (!state.active || !state.playId || seconds < 1) return;
  const sentSeconds = Math.min(600, seconds); state.rewardPendingMs -= sentSeconds * 1000;
  const musicId = state.active.id, playId = state.playId;
  await api(`/api/music/${encodeURIComponent(musicId)}/play/${encodeURIComponent(playId)}`, { method: "PATCH", body: { seconds: sentSeconds } }).catch(() => {
    if (state.active?.id === musicId && state.playId === playId) state.rewardPendingMs += sentSeconds * 1000;
  });
}

async function stopHeartbeat(flush = false) {
  clearInterval(state.heartbeat); state.heartbeat = null;
  collectRewardTime();
  const musicId = state.active?.id, playId = state.playId, seconds = Math.min(600, Math.floor(state.rewardPendingMs / 1000));
  state.rewardStartedAt = null; state.rewardPendingMs = 0; state.playId = null;
  if (flush && musicId && playId && seconds > 0) {
    await api(`/api/music/${encodeURIComponent(musicId)}/play/${encodeURIComponent(playId)}`, { method: "PATCH", body: { seconds } }).catch(() => undefined);
  }
}

function startHeartbeat() {
  clearInterval(state.heartbeat);
  state.rewardPendingMs = 0; state.rewardStartedAt = audio.paused ? null : Date.now();
  state.heartbeat = setInterval(() => { void flushHeartbeat(); publishPresence(); }, 10_000);
}

function publishPresence() {
  if (!state.user?.shareListening || !state.active) return;
  window.f4we.presence.emit("listening:update", { musicId: state.active.id, title: state.active.title, artist: state.active.artist || null, artworkUrl: state.active.artworkUrl || null, position: audio.currentTime || 0, playing: !audio.paused });
}

function renderPlayerSensitiveView() {
  if (["liked", "playlist", "release", "artist"].includes(state.view)) {
    if (state.view === "liked") renderLiked();
    else if (state.view === "playlist" && state.openPlaylist) void openPlaylist(state.openPlaylist.id);
    else if (state.view === "release" && state.openRelease) void openRelease(state.openRelease.id);
    else if (state.view === "artist" && state.openArtist) void openArtist(state.openArtist.id);
  }
}

function togglePlay() {
  if (!state.active) { if (state.songs[0]) void playSong(state.songs[0]); return; }
  if (audio.paused) void audio.play().catch(error => { if (error?.name !== "AbortError") toast(`Playback failed: ${error.message}`, "error"); }); else audio.pause();
}
function playNext() {
  if (!state.queue.length) return; let index;
  if (state.shuffle) index = Math.floor(Math.random() * state.queue.length); else index = state.queueIndex + 1;
  if (index >= state.queue.length) index = state.repeat ? state.queueIndex : 0; void playSong(state.queue[index], state.queue);
}
function playPrevious() { if (audio.currentTime > 3) { audio.currentTime = 0; return; } if (!state.queue.length) return; const index = Math.max(0, state.queueIndex - 1); void playSong(state.queue[index], state.queue); }
function toggleShuffle() { state.shuffle = !state.shuffle; updatePlayerChrome(); if (state.view === "settings" && state.settingsTab === "playback") renderPlaybackSettings(); }
function toggleRepeat() { state.repeat = !state.repeat; audio.loop = state.repeat; updatePlayerChrome(); if (state.view === "settings" && state.settingsTab === "playback") renderPlaybackSettings(); }

async function toggleLike(songId) {
  const song = state.songs.find(item => item.id === songId) || state.queue.find(item => item.id === songId); if (!song) return;
  const liked = state.favorites.some(item => item.id === songId);
  try { await api(`/api/music/${encodeURIComponent(songId)}/like`, { method: liked ? "DELETE" : "POST" }); if (liked) state.favorites = state.favorites.filter(item => item.id !== songId); else state.favorites.unshift({ ...song, liked: true }); song.liked = !liked; updatePlayerChrome(); if (state.view === "liked") renderLiked(); toast(liked ? "Removed from Liked Songs" : "Added to Liked Songs"); } catch (error) { toast(error.message, "error"); }
}

function showQueue() {
  showModal(`<h2>Play queue</h2>${state.queue.length ? state.queue.map((song, index) => `<div class="song-row ${index === state.queueIndex ? "active" : ""}" data-play-song="${safe(song.id)}" data-queue-source="current"><span class="song-index">${index + 1}</span><div class="song-main"><img src="${image(song.artworkUrl)}"><div><strong>${safe(song.title)}</strong><span>${safe(song.artist || "Unknown artist")}</span></div></div></div>`).join("") : '<div class="empty-state">Your queue is empty.</div>'}`);
}

function parseTimedLyrics(content) {
  return String(content).split(/\r?\n/).flatMap(line => {
    const matches = [...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    const text = line.replace(/(?:\[[^\]]+\]\s*)+/g, "").trim();
    return matches.map(match => ({ seconds: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`), text })).filter(item => item.text);
  }).sort((a, b) => a.seconds - b.seconds);
}

async function showLyrics() {
  if (!state.active) return toast("Play a song first");
  try {
    const lyrics = await api(`/api/music/${encodeURIComponent(state.active.id)}/lyrics`);
    state.openLyrics = lyrics.type === "timed" ? parseTimedLyrics(lyrics.content) : [];
    showModal(`<p class="section-kicker">${safe(state.active.artist || "F4WE")}</p><h2>${safe(state.active.title)}</h2>${lyrics.type === "timed" ? `<div class="lyrics-view">${state.openLyrics.map((line, index) => `<button class="lyrics-line" data-lyric-index="${index}" data-seek-time="${line.seconds}">${safe(line.text)}</button>`).join("")}</div>` : `<div class="plain-lyrics">${safe(lyrics.content)}</div>`}`);
    updateActiveLyric();
  } catch (error) { toast(error.status === 404 ? "This song does not have lyrics yet." : error.message, "error"); }
}

function updateActiveLyric() {
  if (!state.openLyrics?.length || $("#modal").classList.contains("hidden")) return;
  let active = 0; for (let index = 0; index < state.openLyrics.length; index++) if (state.openLyrics[index].seconds <= audio.currentTime + .15) active = index;
  $$(".lyrics-line").forEach((line, index) => line.classList.toggle("active", index === active));
  const line = $(`.lyrics-line[data-lyric-index="${active}"]`); if (line) line.scrollIntoView({ block: "center", behavior: "smooth" });
}

function renderView() {
  if (!state.user) return;
  if (state.view === "home") renderHome();
  else if (state.view === "search") void renderSearch();
  else if (state.view === "library") renderLibrary("library");
  else if (state.view === "playlists") renderLibrary("mine");
  else if (state.view === "liked") renderLiked();
  else if (state.view === "artists") renderArtists();
  else if (state.view === "albums") renderAlbums();
  else if (state.view === "friends") void renderFriends();
  else if (state.view === "activity") void renderActivity();
  else if (state.view === "profile") void renderProfile();
  else if (state.view === "user" && state.openUser) void openPublicProfile(state.openUser.id);
  else if (state.view === "settings") renderSettings();
  else if (state.view === "artist" && state.openArtist) void openArtist(state.openArtist.id);
  else if (state.view === "release" && state.openRelease) void openRelease(state.openRelease.id);
  else if (state.view === "playlist" && state.openPlaylist) void openPlaylist(state.openPlaylist.id);
  else renderHome();
}

async function buyProduct(key) { if (!confirm("Purchase this item with F4WE COIN?")) return; try { const result = await api(`/api/shop/purchase/${encodeURIComponent(key)}`, { method: "POST" }); if (result.inviteCode) showModal(`<h2>Your invite code</h2><p>This code can be used once:</p><div class="surface"><strong>${safe(result.inviteCode)}</strong></div>`); else toast("Purchase complete"); await renderShop(); } catch (error) { toast(error.message, "error"); } }
async function refreshCurrentProfile() {
  const profile = await api("/api/profile/me");
  state.user = profile.user;
  if (profile.refreshedToken) await setToken(profile.refreshedToken);
  updateUserChrome();
}

async function useOrBuyDesign(id, buy) { try { await api(`/api/shop/designs/${encodeURIComponent(id)}/${buy ? "purchase" : "use"}`, { method: "POST" }); if (!buy) await refreshCurrentProfile(); toast(buy ? "Design purchased" : "Design applied"); await renderShop(); } catch (error) { toast(error.message, "error"); } }

function editRank(userId) {
  const user = state.developerUsers?.find(item => item.id === userId); if (!user) return;
  showModal(`<h2>Edit ${safe(user.username)}'s rank</h2><form id="rank-form"><label class="field">Rank<select name="rank">${["Access","Moderator","Admin","Developer"].map(rank => `<option ${user.rank === rank ? "selected" : ""}>${rank}</option>`).join("")}</select></label><div class="form-actions"><button class="primary">Save rank</button></div></form>`);
  $("#rank-form").addEventListener("submit", async event => { event.preventDefault(); try { await api(`/api/developer/users/${encodeURIComponent(userId)}/rank`, { method: "PATCH", body: Object.fromEntries(new FormData(event.currentTarget)) }); closeModal(); toast("Rank updated"); } catch (error) { toast(error.message, "error"); } });
}

document.addEventListener("click", async event => {
  const target = event.target;
  const windowButton = target.closest("[data-window]"); if (windowButton) return void window.f4we.windowControl(windowButton.dataset.window);
  if (target.closest("[data-close-modal]")) return closeModal();
  const view = target.closest("[data-view]"); if (view) return navigate(view.dataset.view);
  const like = target.closest("[data-like-song]"); if (like) { event.stopPropagation(); return void toggleLike(like.dataset.likeSong); }
  const songTarget = target.closest("[data-play-song]"); if (songTarget?.dataset.playSong) { const queue = songTarget.dataset.queueSource === "current" ? state.queue : queueFor(songTarget.dataset.queueSource); const song = queue.find(item => item.id === songTarget.dataset.playSong) || findSongById(songTarget.dataset.playSong); if (song) { closeModal(); return void playSong(song, queue.length ? queue : [song]); } toast("This song is no longer available.", "error"); return; }
  const playlist = target.closest("[data-open-playlist]"); if (playlist) return void openPlaylist(playlist.dataset.openPlaylist);
  const artist = target.closest("[data-open-artist]"); if (artist) return void openArtist(artist.dataset.openArtist);
  const release = target.closest("[data-open-release]"); if (release) return void openRelease(release.dataset.openRelease);
  const join = target.closest("[data-join-friend]"); if (join) return void joinFriend(join.dataset.joinFriend);
  const transfer = target.closest("[data-transfer-friend]"); if (transfer) return openCoinTransfer(transfer.dataset.transferFriend);
  const send = target.closest("[data-send-friend]"); if (send) { try { await api("/api/friends/requests", { method: "POST", body: { username: send.dataset.sendFriend } }); toast("Friend request sent"); renderFriends("search"); } catch (error) { toast(error.message, "error"); } return; }
  const accept = target.closest("[data-accept-request]"); if (accept) { try { await api(`/api/friends/requests/${accept.dataset.acceptRequest}/accept`, { method: "POST" }); toast("Friend added"); renderFriends("requests"); } catch (error) { toast(error.message, "error"); } return; }
  const decline = target.closest("[data-decline-request]"); if (decline) { await api(`/api/friends/requests/${decline.dataset.declineRequest}`, { method: "DELETE" }); return void renderFriends("requests"); }
  const remove = target.closest("[data-remove-friend]"); if (remove) { if (confirm("Remove this friend?")) { await api(`/api/friends/${remove.dataset.removeFriend}`, { method: "DELETE" }); return void renderFriends(); } return; }
  const user = target.closest("[data-open-user]"); if (user) return void openPublicProfile(user.dataset.openUser);
  const move = target.closest("[data-move-song]"); if (move) { event.stopPropagation(); return void movePlaylistSong(move.dataset.moveSong, move.dataset.direction); }
  const deleteNotification = target.closest("[data-delete-notification]"); if (deleteNotification) { await api(`/api/profile/notifications/${deleteNotification.dataset.deleteNotification}`, { method: "DELETE" }); return void renderActivity(); }
  const deleteRequest = target.closest("[data-delete-request]"); if (deleteRequest) { if (confirm("Delete this music request?")) { await api(`/api/profile/requests/${deleteRequest.dataset.deleteRequest}`, { method: "DELETE" }); return void renderActivity("requests"); } return; }
  const deleteBug = target.closest("[data-delete-bug]"); if (deleteBug) { if (confirm("Delete this bug report?")) { await api(`/api/profile/bugs/${deleteBug.dataset.deleteBug}`, { method: "DELETE" }); return void renderActivity("bugs"); } return; }
  const deleteIdea = target.closest("[data-delete-idea]"); if (deleteIdea) { if (confirm("Delete this update idea?")) { await api(`/api/profile/update-ideas/${deleteIdea.dataset.deleteIdea}`, { method: "DELETE" }); return void renderActivity("ideas"); } return; }
  const buyProductButton = target.closest("[data-buy-product]"); if (buyProductButton) return void buyProduct(buyProductButton.dataset.buyProduct);
  const buyDesign = target.closest("[data-buy-design]"); if (buyDesign) return void useOrBuyDesign(buyDesign.dataset.buyDesign, true);
  const useDesign = target.closest("[data-use-design]"); if (useDesign) return void useOrBuyDesign(useDesign.dataset.useDesign, false);
  if (target.closest("[data-unuse-design]")) { try { await api("/api/shop/designs/active", { method: "DELETE" }); await refreshCurrentProfile(); toast("Profile design removed"); renderShop(); } catch (error) { toast(error.message, "error"); } return; }
  const ownerProduct = target.closest("[data-owner-product]"); if (ownerProduct) { const key = ownerProduct.dataset.ownerProduct, price = Number($(`#product-price-${CSS.escape(key)}`).value), active = ownerProduct.dataset.productActive !== "true"; try { await api(`/api/shop/owner/products/${encodeURIComponent(key)}`, { method: "PATCH", body: { price, active } }); toast(`Shop product ${active ? "enabled" : "disabled"}`); renderOwnerSettings(); } catch (error) { toast(error.message, "error"); } return; }
  const copyId = target.closest("[data-copy-id]"); if (copyId) { window.f4we.copyText(copyId.dataset.copyId); return toast("Application ID copied"); }
  const rank = target.closest("[data-edit-rank]"); if (rank) return editRank(rank.dataset.editRank);
  const manage = target.closest("[data-manage-song]"); if (manage) return manageSong(manage.dataset.manageSong);
  const reviewRequest = target.closest("[data-review-request]"); if (reviewRequest) { const status = reviewRequest.dataset.reviewStatus; const reason = status === "Rejected" ? prompt("Rejection reason:") : undefined; if (status === "Rejected" && !reason) return; try { await api(`/api/profile/staff/requests/${reviewRequest.dataset.reviewRequest}`, { method: "PATCH", body: { status, ...(reason ? { reason } : {}) } }); toast("Music request updated"); loadStaffModeration(); } catch (error) { toast(error.message, "error"); } return; }
  const reviewBug = target.closest("[data-review-bug]"); if (reviewBug) { const status = reviewBug.dataset.reviewStatus; const reason = status === "Rejected" ? prompt("Reason:") : prompt("Optional response:") || undefined; if (status === "Rejected" && !reason) return; try { await api(`/api/profile/staff/bugs/${reviewBug.dataset.reviewBug}`, { method: "PATCH", body: { status, ...(reason ? { reason } : {}) } }); toast("Bug report updated"); loadStaffModeration(); } catch (error) { toast(error.message, "error"); } return; }
  const removeCollaborator = target.closest("[data-remove-collaborator]"); if (removeCollaborator) { try { await api(`/api/playlists/${state.openPlaylist.id}/collaborators/${removeCollaborator.dataset.removeCollaborator}`, { method: "DELETE" }); toast("Collaborator removed"); closeModal(); await openPlaylist(state.openPlaylist.id); editPlaylist(); } catch (error) { toast(error.message, "error"); } return; }
  const seekTime = target.closest("[data-seek-time]"); if (seekTime) { audio.currentTime = Number(seekTime.dataset.seekTime); if (audio.paused) void audio.play(); return; }
});

$("#global-search").addEventListener("submit", event => { event.preventDefault(); navigate("search"); });
$("#search-input").addEventListener("input", event => { if (state.view !== "search") return; clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => renderSearch(event.target.value.trim()), 300); });
$("#login-form").addEventListener("submit", event => { event.preventDefault(); void authenticate("login", event.currentTarget); });
$("#register-form").addEventListener("submit", event => { event.preventDefault(); void authenticate("register", event.currentTarget); });
$$('[data-auth-tab]').forEach(button => button.addEventListener("click", () => { $$('[data-auth-tab]').forEach(item => item.classList.toggle("active", item === button)); $("#login-form").classList.toggle("hidden", button.dataset.authTab !== "login"); $("#register-form").classList.toggle("hidden", button.dataset.authTab !== "register"); $("#auth-error").textContent = ""; }));
$("#logout-button").addEventListener("click", () => logout());
$("#play-button").addEventListener("click", togglePlay); $("#previous-button").addEventListener("click", playPrevious); $("#next-button").addEventListener("click", playNext); $("#shuffle-button").addEventListener("click", toggleShuffle); $("#repeat-button").addEventListener("click", toggleRepeat); $("#like-current").addEventListener("click", () => state.active && toggleLike(state.active.id)); $("#queue-button").addEventListener("click", showQueue);
$("#lyrics-button").addEventListener("click", showLyrics);
$("#seek").addEventListener("input", event => { if (Number.isFinite(audio.duration)) audio.currentTime = Number(event.target.value) / 100 * audio.duration; });
$("#volume").value = String(audio.volume); $("#volume").addEventListener("input", event => { audio.volume = Number(event.target.value); localStorage.setItem("f4we.volume", String(audio.volume)); });
$("#fullscreen-button").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen());
$("#back-button").addEventListener("click", () => { if (state.historyIndex <= 0) return; state.historyIndex--; navigate(state.history[state.historyIndex], false); });
$("#forward-button").addEventListener("click", () => { if (state.historyIndex >= state.history.length - 1) return; state.historyIndex++; navigate(state.history[state.historyIndex], false); });
document.addEventListener("keydown", event => { if (event.ctrlKey && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); } if (event.code === "Space" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) { event.preventDefault(); togglePlay(); } });

window.f4we.mediaControls?.onAction(action => {
  if (action === "like" && state.active) void toggleLike(state.active.id);
  else if (action === "previous") playPrevious();
  else if (action === "toggle") togglePlay();
  else if (action === "next") playNext();
});

audio.addEventListener("play", () => { if (state.playId && !state.rewardStartedAt) state.rewardStartedAt = Date.now(); updatePlayerChrome(); publishPresence(); });
audio.addEventListener("pause", () => { collectRewardTime(); updatePlayerChrome(); publishPresence(); });
audio.addEventListener("ended", () => { if (!state.repeat) playNext(); });
audio.addEventListener("error", () => toast("Playback failed. Check your connection and try again.", "error"));
audio.addEventListener("loadedmetadata", () => { if (state.active && audio.duration > 0 && !state.active.duration) { state.active.duration = Math.round(audio.duration); void api(`/api/music/${encodeURIComponent(state.active.id)}/duration`, { method: "PATCH", body: { duration: state.active.duration } }).catch(() => undefined); } });
audio.addEventListener("timeupdate", () => { const duration = Number.isFinite(audio.duration) ? audio.duration : state.active?.duration || 0; $("#elapsed").textContent = formatTime(audio.currentTime); $("#duration").textContent = formatTime(duration); $("#seek").value = duration ? String(audio.currentTime / duration * 100) : "0"; updateActiveLyric(); });

(async function init() {
  state.config = await window.f4we.config();
  await window.f4we.setToken(state.token);
  updatePlayerChrome();
  if (state.token) await enterApp();
})();
