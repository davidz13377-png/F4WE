# F4WE Android 1.3.0 / Windows 1.5.0 frissítés

## Mit tartalmaz

- Platformonként kapcsolható maintenance break: külön Android és külön Windows 10/11 célzás.
- A Windows kliens most már teljes képernyős, bezárhatatlan maintenance üzenetet mutat, majd automatikusan felold, amikor véget ér a karbantartás.
- Új **Notification Send** Owner Portal funkció külön címmel, üzenettel és platformválasztással.
- Az owner üzenet belépéskor jelenik meg, kiírja a küldő owner nevét, és az OK megnyomásáig nem zárható be.
- A Windows Activity oldalon teljes Music Request, Bug Report és Update Idea rendszer, saját beküldések törlésével.
- Androidon a bejelentkezett session nem vész el egy átmeneti maintenance válasz miatt.

## Telepítés, ellenőrzés és push

A ZIP tartalmát másold a `C:\mb` mappába, majd futtasd:

```bat
cd /d C:\mb

npm ci
npm run db:generate
npm --workspace @music-box/api run typecheck
npm --workspace @music-box/mobile run typecheck

node tests\f4we-platform-update.cjs
node tests\f4we-windows-app.cjs
node tests\f4we-windows-1.4-update.cjs
node tests\f4we-platform-controls-update.cjs

git add -A
git commit -m "Release Android 1.3 and Windows 1.5 platform controls"
git push origin main
```

A Railway API sikeres deployja kötelező. A deploy közben a `prisma migrate deploy` létrehozza az owner announcement táblákat.

## Android tesztelése

Az emulátor legyen elindítva Android Studioban. Első CMD:

```bat
cd /d C:\mb\apps\mobile
set EXPO_PUBLIC_API_URL=https://f4we-api-production.up.railway.app
npx expo start --dev-client -c
```

Második CMD, ha az új natív buildet is telepíteni kell:

```bat
cd /d C:\mb\apps\mobile
set EXPO_PUBLIC_API_URL=https://f4we-api-production.up.railway.app
npx expo run:android --no-bundler
```

## Android APK készítése

```bat
cd /d C:\mb\apps\mobile
eas build --platform android --profile preview
```

## Windows teszt és build

```bat
cd /d C:\mb
npm run dev:windows
```

Telepítő és portable EXE készítése Node.js 22.13 vagy újabb verzióval:

```bat
cd /d C:\mb
npm run build:windows
```

A kész fájlok a `C:\mb\desktop-windows\release` mappába kerülnek `F4WE-Windows-1.5.0-x64.exe` néven.
