# F4WE összesített feltöltés + Spotify-link javítás

Ez a csomag az előző MP3-javítást is tartalmazza, és ugyanazzal a helyes Expo multipart feltöltéssel javítja:

- az MP3 feltöltést;
- a profilképet;
- a playlist képét;
- a zeneborítót.

A Spotify támogatás **track linket fogad és hivatalos Spotify-metaadatot kér le**. A Spotify hanganyagát nem másolja le. Spotify kérésnél a staff a felhő ikonról megnyitja a Music Uploadert, feltölti a használható MP3-at, majd elfogadja a kérést. A meglévő YouTube/Discord bot import változatlanul megmarad.

## Telepítés

1. Csomagold ki a ZIP-et közvetlenül a `C:\mb` mappába, és engedélyezd a fájlok felülírását.
2. Nyiss Parancssort, majd futtasd:

```bat
cd /d C:\mb
npm --workspace @music-box/mobile run typecheck
npm --workspace @music-box/api run typecheck
npm --workspace @music-box/bot run typecheck
node tests\f4we-features.cjs
node tests\f4we-import-worker.cjs
git add .
git commit -m "Fix all mobile uploads and add Spotify requests"
git push origin main
```

3. Várd meg, amíg a Railway API és bot ismét `Online` lesz.
4. Az APK-ban lévő kliensjavítás miatt új Android build szükséges:

```bat
cd /d C:\mb\apps\mobile
eas build --platform android --profile preview
```

5. A kész build végén kapott Expo-linkről töltsd le és telepítsd az új APK-t. A régi APK továbbra is a hibás feltöltési kódot tartalmazza.

## Gyors próba

Az új APK-val ebben a sorrendben próbáld ki:

1. profilkép feltöltése;
2. egy kis MP3 feltöltése;
3. playlist kép cseréje;
4. Spotify track link beküldése a Music Requests oldalon.

