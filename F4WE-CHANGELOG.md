# F4WE Changelog

Ettől a verziótól minden kiadás változásai ebbe a fájlba kerülnek. Az alkalmazásban megjelenő update szöveghez a **Public release notes** rész használható. A kizárólag staff/owner vagy technikai változások külön részben szerepelnek.

## 1.3.0 – 2026-10-11

### Public release notes

- F4WE is now available as a native Windows desktop application.
- The Windows app uses the same account, music library, playlists, friends, F4WE COIN balance and profile as the mobile app.
- Added a full desktop player with queue, shuffle, repeat, seek, volume, favorites and protected online streaming.
- Added desktop search for songs, playlists, artists and albums.
- Added official artist profiles with images, biographies, discographies and connected songs.
- Added official Albums, EPs and Singles with cover art, release dates and ordered track lists.
- Friends Activity and Listen Together are available directly from the desktop dashboard.
- Profiles, yearly recap, notifications, update posts, requests, bug reports, collaborative playlists and the F4WE Shop are available on Windows.
- Added the animated F4WE glitch identity, the Eclipse of Sound featured artwork and the new Windows application icon.
- Fixed Windows search so songs and playlists still appear even if an optional catalog endpoint is unavailable.
- Fixed Home music cards so every displayed song starts with the correct queue.
- Friend rows and search results now open complete public profiles.
- Profile designs are now visible on your own profile, friend profiles, search results and navigation avatars.
- Fixed profile designs so each purchased frame appears only on its owner.
- Rebuilt desktop avatar layering to keep the portrait mathematically centred while the complete transparent decoration renders above it, matching the mobile app.
- Removed the conflicting legacy avatar rules and global frame offset that clipped small navigation and friends-list decorations.
- Framed and unframed avatars now use separate fixed geometry, preventing navigation and friends-list portraits from shifting.
- Refined the Windows interface with a consistent black/gray theme, white F4WE wordmark and Spotify-style vector icons.
- Login and registration now use a fully black background, with a denser and stronger monochrome F4WE glitch effect.
- Adjusted the glitch timing so the F4WE wordmark stays readable between effects.
- The glitch keeps its fast movement but now appears in shorter, less frequent bursts.
- Corrected song-duration alignment and made the player pause icon visible on its white control.
- Fixed friend names and action-button alignment, and renamed the player lyrics control to **Lyrics**.

### Staff and owner tools

- Staff can create official artist pages and upload artist images from the Windows Settings portal.
- Staff can create Albums, EPs and Singles, upload cover art and connect existing F4WE tracks.
- Staff can upload new MP3 files directly to R2 from the Windows application.
- Developer and Owner portals are available under Settings with user, rank, system, maintenance, update and F4WE COIN controls.

### Platform and technical changes

- Added a shared PostgreSQL catalog for artists, releases and ordered release tracks.
- Added authenticated desktop media streaming with byte-range support and no token exposure in media URLs.
- Added Windows NSIS installer and portable build targets.
- Windows app version: `1.3.0`

## 1.2.0 – 2026-10-06

### Public release notes

- Discord Activity now shows the song and artist currently playing in F4WE, with playback time and a **Try F4WE** button.
- Public playlists can now be shared with a rich preview and an app deep link.
- Friends invited to collaborative playlists can now add songs correctly.
- Playlist songs can be reordered and saved.
- Tapping a timed lyrics line now jumps directly to that part of the song.
- Notifications can be deleted individually or cleared together.
- Friends can transfer F4WE COIN to each other.
- The F4WE Shop now includes a listening-time calculator for coin goals.
- Used reward invite codes disappear automatically.
- Reward coins no longer create repetitive phone notifications.
- Playlist duration and track totals refresh faster.
- Duplicate song detection has been improved.
- Profile decorations remain owned after removal from the shop and can be unequipped.
- Updated F4WE application icon and notification appearance.
- Fixed music playback being blocked by the required-update check.
- Fixed manual music uploads failing during duplicate checking.
- Improved Discord MP3 detection for valid files with uncommon metadata or headers.

### Staff and owner tools

- Staff profiles display the number of active music requests.
- Owner can securely reset a user's password and invalidate their existing sessions.
- User application IDs accept between 1 and 16 digits.
- Music Manager includes song information and improved audio cutting controls.
- Owner update enforcement and maintenance mode controls are available.
- Staff activity statistics and additional moderation controls were added.

### Platform and technical changes

- Added native Discord Social SDK integration for Android.
- Fixed native Android packaging so the Discord CMake configuration is always included in update ZIPs and Git commits.
- Fixed the Discord Android bridge for React Native 0.86 Kotlin compilation.
- Preserved React Native's native TurboModule registration while linking the Discord SDK, fixing the `PlatformConstants` startup crash.
- Added Firebase/Expo push registration and server-side push delivery.
- Added playlist Open Graph previews and Android deep-link fallback.
- Added database session versioning for secure password resets.
- Native TrackPlayer stream requests now include the F4WE app-version header, preventing HTTP 426 responses.
- The API keeps authentication and maintenance protection on media streams while allowing existing 1.2.0 builds that lack the native version header.
- Replaced the PostgreSQL-incompatible NUL-separated duplicate lock with two safe advisory-lock keys.
- Discord uploads now validate real MPEG frame sequences and retry through Discord's proxy URL when needed.
- App version: `1.2.0`
- Android version code: `3`

## Következő frissítések

Minden új kiadásnál:

1. Növeljük az alkalmazás verzióját és az Android version code értékét.
2. Felírjuk az új funkciókat, fejlesztéseket és hibajavításokat.
3. Külön választjuk a publikus és a csak staff/owner által látható változásokat.
4. A tesztekben is ellenőrizzük a kiadás pontos verzióját.
