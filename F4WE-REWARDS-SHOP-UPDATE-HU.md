# F4WE – Rewards, Shop és profilfrissítés

## Mit tartalmaz

- Dalszöveg-követés: az aktív sor mindig a látható terület közepére kerül.
- Az Update Ideas mindenkinél a helyes felhasználónevet mutatja.
- Hallgatás együtt: a lejátszó kijelzi, kik csatlakoztak hozzád.
- Playlist átnevezés, védett Staff Playlist és teljes zeneszámláló.
- Saját felhasználónév módosítása, kis-/nagybetűtől független egyediség és bejelentkezés.
- Azonos cím + azonos előadó esetén feltöltési megerősítés.
- Profilbanner, animált profilkép/banner jogosultság és animált profilkeretek.
- Hallgatási jutalom, F4WE coin-egyenleg, F4WE Shop és egyszer használatos `rew...` meghívókód.
- Owner Portal coin-, reward-, termék- és profilkeret-kezeléssel.
- Kattintható nyilvános profil bannerrel, ranggal és publikus playlistekkel.
- Discord `/addmusic` és kizárólag a kijelölt Discord-owner által használható `/removeowner`.

## Telepítés

Az adatbázisban és az R2-ben nem kell kézzel táblát vagy mappát létrehozni. A Railway API indulásakor a Prisma-migráció létrehozza az új táblákat és alap shop-termékeket. Az R2 mappák az első feltöltéskor automatikusan létrejönnek.

Windows CMD-ben, a frissítés bemásolása után:

```bat
cd /d C:\mb
npm ci
npm run db:generate
npm run typecheck
node tests\f4we-features.cjs
node tests\f4we-import-worker.cjs
node tests\f4we-social-player-update.cjs
node tests\f4we-rewards-shop-update.cjs
git add .
git commit -m "Add F4WE rewards shop banners and staff music tools"
git push origin main
```

Várd meg, hogy Railwayen az **API és a bot is Online** legyen. A deploy logban a migrációnak sikeresen le kell futnia.

## Új APK

Ehhez a frissítéshez új APK szükséges, mert bekerült az animált GIF-eket kezelő natív `expo-image` modul.

```bat
cd /d C:\mb\apps\mobile
eas build --platform android --profile preview
```

Az EAS a végén ad egy letöltési linket. A build alatt a CMD bezárható, mert a fordítás az Expo szerverén folytatódik.

## Első profilkeret feltöltése

Az appban nyisd meg: **Profile → Owner Portal → Design Add**. Válaszd ki a példaként kapott GIF-et, add meg a nevét és az árát, állítsd be a Limited Edition kapcsolót, majd nyomd meg a **Publish design** gombot. Ezután azonnal megjelenik az F4WE Shopban.

## Discord-parancsok

- `/addmusic`: zene neve, előadó, borítókép-link és MP3 csatolmány. Azonos cím+előadó esetén újra kell futtatni a megerősítő kapcsolóval.
- `/removeowner`: 16 jegyű alkalmazás-ID. Csak a `1141698223141048463` Discord-ID használhatja.

Az új slash parancsok a bot újraindulásakor automatikusan regisztrálódnak.
