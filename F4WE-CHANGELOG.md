# F4WE Changelog

Ettől a verziótól minden kiadás változásai ebbe a fájlba kerülnek. Az alkalmazásban megjelenő update szöveghez a **Public release notes** rész használható. A kizárólag staff/owner vagy technikai változások külön részben szerepelnek.

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
- Added Firebase/Expo push registration and server-side push delivery.
- Added playlist Open Graph previews and Android deep-link fallback.
- Added database session versioning for secure password resets.
- App version: `1.2.0`
- Android version code: `3`

## Következő frissítések

Minden új kiadásnál:

1. Növeljük az alkalmazás verzióját és az Android version code értékét.
2. Felírjuk az új funkciókat, fejlesztéseket és hibajavításokat.
3. Külön választjuk a publikus és a csak staff/owner által látható változásokat.
4. A tesztekben is ellenőrizzük a kiadás pontos verzióját.
