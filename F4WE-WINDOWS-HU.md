# F4WE Windows – telepítés és build

Az új Windows kliens a `desktop-windows` mappában van. Alapból a már működő online API-t használja:

`https://f4we-api-production.up.railway.app`

Ugyanazt a PostgreSQL adatbázist, R2 tárhelyet, felhasználói fiókot, zenéket, playlisteket és friend rendszert használja, mint a telefonos alkalmazás.

## 1. A szerverfrissítés ellenőrzése és feltöltése

```bat
cd /d C:\mb

npm ci
npm run db:generate
npm --workspace @music-box/api run typecheck
npm --workspace @music-box/mobile run typecheck
node tests\f4we-windows-app.cjs
node tests\f4we-windows-1.4-update.cjs

git add -A
git commit -m "Add F4WE Windows app and artist albums"
git push origin main
```

A Railway API sikeres deployja közben a `prisma migrate deploy` létrehozza az új artist/album táblákat. A bot és a mobilalkalmazás továbbra is ugyanúgy működik.

## 2. Windows alkalmazás tesztelése

Az Electron 43 biztonságos buildjéhez **Node.js 22.13 vagy újabb** kell. Először ellenőrizd:

```bat
node --version
```

Ha régebbi verziót ír, telepítsd a Node.js 22 LTS kiadását, zárd be a CMD-t, majd nyiss egy újat. Ezután első alkalommal telepítsd a desktop függőségeit:

```bat
cd /d C:\mb\desktop-windows
npm install
```

Ezután indítsd el fejlesztői módban:

```bat
cd /d C:\mb
npm run dev:windows
```

A kliens rögtön az online F4WE API-ra jelentkezik be. Android Studio vagy Metro nem kell hozzá.

## 3. Telepíthető EXE és portable verzió készítése

```bat
cd /d C:\mb
npm run build:windows
```

A kész fájlok itt jelennek meg:

```text
C:\mb\desktop-windows\release\F4WE-Windows-1.4.0-x64.exe
```

A mappában lesz egy telepítős NSIS változat és egy portable EXE is. A telepítő létrehozhat asztali és Start menü parancsikont.

## Helyi API használata (opcionális)

Ha később helyi API-val akarod tesztelni:

```bat
cd /d C:\mb\desktop-windows
set F4WE_API_URL=http://localhost:4000
npm run dev
```

Ha bezárod ezt a CMD ablakot, a következő indítás automatikusan újra az online API-t használja.
