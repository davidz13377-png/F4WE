# F4WE v5 – közvetlen R2 feltöltés + Spotify-link javítás

Ez a csomag az összes korábbi javítást is tartalmazza. Egységesen javítja:

- az MP3 feltöltést;
- a profilképet;
- a playlist képét;
- a zeneborítót.

A v5-ben a fájl bájtjai már **nem mennek át a Railway feltöltési útvonalán**. Az online API egy 10 percig érvényes, az adott felhasználóhoz és fájltípushoz kötött R2 PUT URL-t ad. A telefon közvetlenül a Cloudflare R2-be tölt, majd az API az R2-ben ellenőrzi a méretet, MIME-t és a fájl valódi bájtjait, és csak utána menti az adatbázisba. Ez kerüli meg az Android/Railway HTTP/2 `stream was reset: NO_ERROR` hibát.

A régi multipart API-végpontok kompatibilitási tartalékként megmaradtak, de az új mobil kliens a közvetlen R2 folyamatot használja. Új környezeti változó nem kell: a meglévő `STORAGE_DRIVER=r2`, R2 kulcsok, `JWT_SECRET` és `PUBLIC_API_URL` használatosak.

A Spotify támogatás **track linket fogad és hivatalos Spotify-metaadatot kér le**. A Spotify hanganyagát nem másolja le. Spotify kérésnél a staff a felhő ikonról megnyitja a Music Uploadert, feltölti a használható MP3-at, majd elfogadja a kérést. A meglévő YouTube/Discord bot import változatlanul megmarad.

## Telepítés

1. Csomagold ki a v5 ZIP-et közvetlenül a `C:\mb` mappába, és engedélyezd a fájlok felülírását. A v2/v3/v4 ZIP-et ezután ne használd.
2. Nyiss Parancssort, majd futtasd:

```bat
cd /d C:\mb
npm install
npm --workspace @music-box/mobile run typecheck
npm --workspace @music-box/api run typecheck
npm --workspace @music-box/bot run typecheck
node tests\f4we-features.cjs
node tests\f4we-import-worker.cjs
git add .
git commit -m "Upload media directly to R2"
git push origin main
```

3. Várd meg, amíg legalább a Railway **f4we-api** új deployja `Online` lesz. Az új mobil kliens csak ezután próbálható, mert az új `/upload-url` és `/complete` útvonalak az online API-ban vannak.
4. Az APK-ban lévő kliensjavítás miatt új Android build szükséges:

```bat
cd /d C:\mb\apps\mobile
eas build --platform android --profile preview
```

5. A kész build végén kapott Expo-linkről töltsd le és telepítsd az új APK-t. A régi APK továbbra is a Railway-en át küldi a fájlokat, ezért azt le kell cserélni.

## Gyors próba

Az új APK-val ebben a sorrendben próbáld ki:

1. profilkép feltöltése;
2. egy kis MP3 feltöltése;
3. playlist kép cseréje;
4. Spotify track link beküldése a Music Requests oldalon.

Sikeres feltöltéskor az R2 bucketben a fájlok a `profile/`, `playlist/`, `music-artwork/` és `music/` mappákba kerülnek. MP3-nál az adatbázis `filePath` mezője `r2://music/...` érték lesz.
