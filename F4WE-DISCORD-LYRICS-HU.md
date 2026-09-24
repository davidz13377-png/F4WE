# F4WE – Discord `/szoveg` parancs

## Használat

A parancsot `Moderator`, `Admin` vagy `Developer` jogosultságú, az `AUTHORIZED_USER_IDS` Railway-változóban felsorolt Discord-fiók használhatja.

Discordon írd be:

```text
/szoveg
```

Ezután töltsd ki a mezőket:

- `tipus`: `Követős (.lrc)` vagy `Sima szöveg (.txt)`
- `zene`: az appban látható pontos zenecím
- `fajl`: a megfelelő `.lrc` vagy `.txt` fájl

Példa:

```text
/szoveg tipus:Követős (.lrc) zene:Kicsi lány fajl:kicsi-lany.lrc
```

Ha több zenének teljesen azonos a címe, a bot megmutatja az ID-ket. Ismételd meg a parancsot, és a `zene` mezőbe a megfelelő zene-ID-t írd.

## Ellenőrzések

- A fájl legfeljebb 100 KB lehet.
- UTF-8 szövegfájlnak kell lennie.
- A választott típusnak egyeznie kell a `.lrc` vagy `.txt` kiterjesztéssel.
- A követős `.lrc` fájlnak tartalmaznia kell például `[01:23.45]Dalszöveg` formátumú időzített sort.
- A fájl tartalma a PostgreSQL adatbázisba kerül; külön R2-mappa nem szükséges.

## Telepítés és ellenőrzés

Másold a frissítőcsomag tartalmát a `C:\mb` mappába, majd:

```bat
cd /d C:\mb
npm run db:generate
npm --workspace @music-box/bot run typecheck
node tests\f4we-social-player-update.cjs

git add apps/bot/src/index.ts apps/bot/src/lyrics.ts tests/f4we-social-player-update.cjs F4WE-DISCORD-LYRICS-HU.md
git commit -m "Add Discord lyrics upload command"
git push origin main
```

Várd meg a Railway `f4we-api` és `f4we-bot` sikeres deployját. A bot indulásakor automatikusan regisztrálja a `/szoveg` parancsot a beállított Discord-szerveren.

Ehhez az önálló botfrissítéshez nem kell új APK-t készíteni, ha a dalszöveg-megjelenítést tartalmazó mobilfrissítés már telepítve van.
