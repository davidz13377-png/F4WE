# F4WE Windows 1.4.0 frissítés

## Mit tartalmaz

- Fiókonként külön Recently Played ugyanazon a számítógépen.
- Stabil számváltás gyors kattintásoknál, a megszakított `play()` hiba nélkül.
- Windows tálcás mini vezérlők: Like, előző, Play/Pause és következő.
- Staff artist- és albumszerkesztés közvetlenül az adatlapokról.
- Artist banner feltöltés és profiloldali megjelenítés.
- Teljes, címre és előadóra kereshető zenelista az albumokhoz.
- Pontosabb hallgatási jutalom-időzítés és egyszeri coin visszajelzés.
- Javított profil-design eltávolítás.
- About F4WE tulajdonosi felirat.

## Teszt és push

Miután a ZIP tartalmát bemásoltad a `C:\mb` mappába:

```bat
cd /d C:\mb

npm run db:generate
npm --workspace @music-box/api run typecheck
npm --workspace @music-box/mobile run typecheck
node tests\f4we-windows-app.cjs
node tests\f4we-windows-1.4-update.cjs

git add -A
git commit -m "Release F4WE Windows 1.4.0"
git push origin main
```

A sikeres Railway API deploy után teszteld a Windows klienst:

```bat
cd /d C:\mb
npm run dev:windows
```

## Új Windows EXE készítése

Node.js 22.13 vagy újabb szükséges:

```bat
cd /d C:\mb\desktop-windows
npm install

cd /d C:\mb
npm run build:windows
```

A telepítős és portable EXE a `C:\mb\desktop-windows\release` mappába kerül `F4WE-Windows-1.4.0-x64.exe` néven.

Ehhez a kiadáshoz nincs új Prisma migráció. A módosított API útvonalak miatt a Railway API deployját viszont meg kell várni az artist/album szerkesztés tesztelése előtt.
