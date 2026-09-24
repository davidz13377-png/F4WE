# F4WE – Player, Social, Lyrics frissítés

## Mi került bele?

- Az Android értesítés címe és borítója minden skipnél és automatikus számváltásnál frissül.
- Telefonról választható borítókép a kézi MP3-feltöltésnél.
- Más felhasználók profilképe teljes méretben megnyitható.
- A Developer minden playlistet megnyithat; a privát playlist jól látható `PRIVATE` jelölést kap.
- Saját profilon 10 másodpercig megjeleníthető a teljes hallgatási idő és az aktuális év Top 5 összefoglalója.
- A playlist neve alatt látható a számok együttes hossza.
- Új, F4WE-stílusú Private/Public választó.
- A kinyitott lejátszóból eltűnt a hangerősáv.
- Playlistből és Favoritesből indítva elérhető a shuffle; minden zenénél elérhető az aktuális szám ismétlése.
- Az aktív zene címe halvány piros.
- Új, összeálló betűs/glitch F4WE indítóképernyő.
- Friends képernyő három füllel: Friends, Search, Requests.
- Barátok online állapota és – külön engedélyezés esetén – aktuális zenéje látható; a Join gomb másodpercre szinkronizál.
- A hallgatási adatmegosztás alapból ki van kapcsolva.
- Időzített `.lrc` és sima `.txt` dalszöveg feltölthető kézi feltöltéskor és utólag a Music Managerből.
- Az időzített dalszöveg a lejátszóban követi és kiemeli az aktuális sort.

## Fontos sorrend

1. Először másold be a frissítés fájljait a `C:\mb` mappába, felülírva a régieket.
2. Pushold GitHubra.
3. Várd meg, amíg a Railway `f4we-api` deploy sikeres és online lesz.
4. Csak ezután teszteld vagy buildeld az új mobilalkalmazást.

Az API induláskor automatikusan lefuttatja az új Prisma migrációt. A deploy logban már **5 migrations found** jelenik meg.

## Parancsok Windows CMD-ben

```bat
cd /d C:\mb
npm install
npm run typecheck
node tests\f4we-features.cjs
node tests\f4we-import-worker.cjs
node tests\f4we-social-player-update.cjs

git add .
git commit -m "Add social player lyrics and listening recap"
git push origin main
```

Ezután a Railwayen ellenőrizd a `f4we-api` deployt. A helyes log vége:

```text
No pending migrations to apply.
F4WE API listening on :8080
```

Az első deploynál a migráció alkalmazása is megjelenhet a logban; ez normális.

## Tesztelés Android Studióval

Ehhez a frissítéshez nem került be új natív csomag, ezért a meglévő development builddel is tesztelhető:

```bat
cd /d C:\mb\apps\mobile
set EXPO_PUBLIC_API_URL=https://f4we-api-production.up.railway.app
npx expo start --dev-client -c
```

Ha simán Android Studióból indítod a már meglévő projektet, az is jó. Ha a JavaScript bundle nem frissül, használd a fenti `-c` parancsot és nyomj Reloadot az emulátorban.

## Új APK készítése

Ha minden funkciót kipróbáltál:

```bat
cd /d C:\mb\apps\mobile
eas build --platform android --profile preview
```

Az EAS a végén ad egy letöltési linket az APK-hoz.

## Megjegyzések

- Új Railway változót nem kell létrehozni.
- A hallgatási **idő** a frissítés deployjától kezdve mérődik. A régi lejátszások megmaradnak, de azokhoz korábban nem tárolt másodperceket az adatbázis.
- A régi zenék időtartama az első lejátszásukkor automatikusan kitöltődik; az új kézi MP3-feltöltéseknél az API rögtön kiszámolja.
- A Friends oldalon a hallgatás megosztása alapból privát. A kapcsolót neked kell bekapcsolnod, ha szeretnéd, hogy a barátaid lássák és Joinnal kövessék a zenédet.
- Az `.lrc` sorok például így nézzenek ki: `[01:23.45]Dalszöveg sora`.
- Spotify hangfájl másolása továbbra sem része ennek a frissítésnek; Spotify linkből csak metaadat kérhető, a lejátszható hanghoz jogtisztán feltöltött MP3 szükséges.
