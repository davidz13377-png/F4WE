# F4WE online telepítés – Railway + PostgreSQL + Cloudflare R2 + APK

## A helyes sorrend

1. Cloudflare R2 bucket és hozzáférési kulcs
2. Railway projekt + PostgreSQL
3. Railway API service
4. Meglévő adatbázis és média átmásolása (ha meg akarod tartani)
5. Railway Discord bot service
6. Online API tesztelése
7. A mobil app végleges API URL-je
8. Telepíthető APK készítése

Az APK-t valóban csak a működő Railway-domain után készítsd el, mert az `EXPO_PUBLIC_API_URL` a build során kerül bele.

## 0. Biztonság és mentés

- Készíts másolatot a teljes `C:\mb` mappáról.
- A Discord bot token korábban látható volt egy képernyőképen. A Discord Developer Portalban nyomj `Reset Token`-t, és online kizárólag az új tokent használd.
- A `.env` fájlt, R2 Secret Access Key-t, PostgreSQL URL-t és Discord tokent soha ne töltsd fel GitHubra vagy küldd el másnak.
- A csomag kibontásakor válaszd a `Replace the files in the destination` lehetőséget. A csomag nem tartalmaz `.env` fájlt, adatbázist vagy feltöltött zenéket.

## 1. Cloudflare R2

1. Nyisd meg a Cloudflare Dashboardot.
2. Menj az `R2 Object Storage` részhez.
3. Hozz létre egy bucketet: `f4we-media`.
4. A bucket maradjon privát. A `Public Development URL` nem szükséges.
5. R2 Overview → `Manage R2 API Tokens` → `Create API token`.
6. Jogosultság: `Object Read & Write`.
7. Hatókör: csak a `f4we-media` bucket.
8. Mentsd el ezt a négy értéket:
   - S3 endpoint: `https://ACCOUNT_ID.r2.cloudflarestorage.com`
   - Access Key ID
   - Secret Access Key
   - bucket neve: `f4we-media`

A Secret Access Key csak egyszer látható. Ne kapcsold be a bucket nyilvános URL-jét: az API privát bucketből streameli az MP3-at, a képeket pedig cache-elhető `/media/...` URL-en adja vissza.

## 2. Railway projekt és PostgreSQL

1. Railway → `New Project` → `Empty Project`.
2. Projekt neve például `F4WE`.
3. `+ New` → `Database` → `PostgreSQL`.
4. Ne módosítsd kézzel a PostgreSQL belső változóit.
5. Hozz létre két `Empty Service` service-t:
   - `F4WE API`
   - `F4WE Bot`
6. Csak az `F4WE API` service-nél: Settings → Networking → Public Networking → `Generate Domain`.
7. A bothoz ne generálj domaint.

## 3. F4WE API Railway-változók

`F4WE API` → Variables → Raw Editor. A valódi titkokat írd a helyőrzők helyére:

```env
RAILWAY_DOCKERFILE_PATH=Dockerfile.api
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=IDE_A_HELYI_JWT_SECRET_VAGY_EGY_UJ_EROS_SECRET
PUBLIC_API_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=http://localhost:8081
MAX_MP3_MB=25
STORAGE_DRIVER=r2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=f4we-media
R2_ACCESS_KEY_ID=IDE_AZ_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=IDE_AZ_R2_SECRET_ACCESS_KEY
```

Ha a meglévő bejelentkezéseket is meg akarod tartani, ugyanazt a `JWT_SECRET` értéket használd, mint a helyi `C:\mb\.env` fájlban. Ha ott még a példaérték szerepel, generálj újat, és számíts rá, hogy mindenkinek újra be kell jelentkeznie.

Erős secret generálása Windows PowerShellben:

```powershell
$b = New-Object byte[] 48
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[Convert]::ToBase64String($b)
```

## 4. F4WE Bot Railway-változók

`F4WE Bot` → Variables → Raw Editor:

```env
RAILWAY_DOCKERFILE_PATH=Dockerfile.bot
DATABASE_URL=${{Postgres.DATABASE_URL}}
STORAGE_DRIVER=r2
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_BUCKET=f4we-media
R2_ACCESS_KEY_ID=UGYANAZ_AZ_R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY=UGYANAZ_AZ_R2_SECRET_ACCESS_KEY
YT_DLP_BIN=yt-dlp
FFMPEG_BIN=ffmpeg
DISCORD_BOT_TOKEN=AZ_UJ_DISCORD_BOT_TOKEN
DISCORD_SERVER_ID=A_DISCORD_SZERVER_ID
AUTHORIZED_USER_IDS=A_HELYI_ENV_BOL
AUTHORIZED_USER_RANKS=A_HELYI_ENV_BOL
BUG_REPORT_LOG_CHANNEL=A_HELYI_ENV_BOL
MUSIC_REQUEST_LOG_CHANNEL=A_HELYI_ENV_BOL
USER_REGISTRATION_LOG_CHANNEL=A_HELYI_ENV_BOL
KEY_GENERATION_LOG_CHANNEL=A_HELYI_ENV_BOL
MUSIC_UPLOAD_LOG_CHANNEL=A_HELYI_ENV_BOL
RANK_CHANGE_LOG_CHANNEL=A_HELYI_ENV_BOL
DEBUG_LOG_CHANNEL=1550942743927201974
```

Az `AUTHORIZED_USER_IDS` és `AUTHORIZED_USER_RANKS` vesszővel elválasztott elemszáma pontosan ugyanannyi legyen. Példa egy emberhez:

```env
AUTHORIZED_USER_IDS=1141698223141048463
AUTHORIZED_USER_RANKS=Developer
```

## 5. Feltöltés Railway-re a saját gépedről

CMD rendszergazdai jog nélkül is elég:

```bat
npm install -g @railway/cli
railway login
cd /d C:\mb
railway link
railway up --service "F4WE API"
```

A `railway link` során válaszd az előbb létrehozott F4WE projektet és a production environmentet. A Dockerfile futtatja a Prisma migrációkat is.

Siker után nyisd meg:

```text
https://A_TE_RAILWAY_API_DOMAINED/health
```

Ezt kell visszaadnia:

```json
{"ok":true,"service":"f4we-api"}
```

A botot csak az adatmásolás után indítsd:

```bat
cd /d C:\mb
railway up --service "F4WE Bot"
```

A bot logjában ezt keresd: `Discord bot ready as ...`. A bot Docker image tartalmazza az FFmpeg, yt-dlp és Node JavaScript runtime eszközöket.

## 6. Meglévő helyi adatbázis átvitele (opcionális, de nálad ajánlott)

Először az API deploy fusson le, hogy a Railway-adatbázis táblái létrejöjjenek. A mobil APK még ne használja az online API-t.

Helyi adat exportálása CMD-ben:

```bat
cd /d C:\mb
docker compose exec -T postgres pg_dump -U musicbox -d musicbox --data-only --inserts --column-inserts --exclude-table-data=public._prisma_migrations > C:\mb\f4we-data.sql
```

A Railway PostgreSQL service Variables részéből másold ki a `DATABASE_PUBLIC_URL` értéket. Importálás:

```bat
docker run --rm -v C:\mb:/backup postgres:16-alpine psql "IDE_A_DATABASE_PUBLIC_URL" -f /backup/f4we-data.sql
```

Ezt csak üres Railway-adatbázisba futtasd egyszer. Ismételt futtatás duplikált kulcs hibát okozhat.

## 7. Meglévő MP3-ak és képek átvitele R2-be

Nyiss PowerShellt a `C:\mb` mappában, és állítsd be ideiglenesen az online kapcsolatot. A helyőrzőket cseréld valódi értékekre:

```powershell
cd C:\mb
$env:DATABASE_URL = "IDE_A_RAILWAY_DATABASE_PUBLIC_URL"
$env:PUBLIC_API_URL = "https://A_TE_RAILWAY_API_DOMAINED"
$env:STORAGE_DRIVER = "r2"
$env:R2_ENDPOINT = "https://ACCOUNT_ID.r2.cloudflarestorage.com"
$env:R2_BUCKET = "f4we-media"
$env:R2_ACCESS_KEY_ID = "IDE_AZ_ACCESS_KEY_ID"
$env:R2_SECRET_ACCESS_KEY = "IDE_A_SECRET_ACCESS_KEY"
$env:LOCAL_MEDIA_DIR = "C:\mb\apps\api\uploads"
npm run migrate:media:r2
```

A script az MP3 rekordokat `r2://music/...` hivatkozásra, a saját profil-/playlist-/zene-képeket pedig online `/media/...` URL-re állítja. A helyi fájlokat nem törli.

Utána zárd be ezt a PowerShell ablakot, hogy az ideiglenes secret változók eltűnjenek.

## 8. Online ellenőrzőlista

- `/health` 200 választ ad.
- A Railway API logban nincs Prisma migration hiba.
- A Railway Bot logban megjelenik a ready üzenet.
- A Discord slash parancsok válaszolnak.
- Bejelentkezés működik.
- Profilkép feltöltés és megjelenítés működik.
- Playlist cover feltöltés működik.
- MP3 feltöltés és lejátszás működik.
- Beletekerés működik (R2 range streaming).
- YouTube import működik.
- API és bot restart után is megmaradnak a képek és zenék.

## 9. Mobil app átállítása az online API-ra

`C:\mb\apps\mobile\.env` tartalma:

```env
EXPO_PUBLIC_API_URL=https://A_TE_RAILWAY_API_DOMAINED
```

Ne legyen a domain végén `/`. Először fejlesztői builddel teszteld:

```bat
cd /d C:\mb\apps\mobile
npm run android
```

Ha a regisztráció, belépés, zene, kép és Discord import is jó mobilinternetről/Wi-Fi-ről, jöhet az APK.

## 10. Telepíthető APK EAS Builddel

Az `eas.json` már tartalmaz `preview` APK-profilt. CMD:

```bat
npm install -g eas-cli
cd /d C:\mb\apps\mobile
eas login
eas init
eas env:set --name EXPO_PUBLIC_API_URL --value https://A_TE_RAILWAY_API_DOMAINED --environment preview --visibility plaintext
eas build --platform android --profile preview
```

Az `eas init` hozzáadhat egy EAS project ID-t az app konfigurációjához; ezt tartsd meg. Az EAS a build végén ad egy letöltési linket a telepíthető `.apk` fájlhoz.

A projekt tartósan alkalmazza a React Native Track Player javítását, és prebuildkor bemásolja az F4WE notification ikont is. Így a cloud APK-ból nem marad ki a korábbi New Architecture/crash és notification javítás.

Google Play feltöltéshez később APK helyett AAB kell:

```bat
eas env:set --name EXPO_PUBLIC_API_URL --value https://A_TE_RAILWAY_API_DOMAINED --environment production --visibility plaintext
eas build --platform android --profile production
```

## Hivatalos leírások

- Railway monorepo: https://docs.railway.com/guides/deploying-a-monorepo
- Railway Dockerfile útvonal: https://docs.railway.com/builds/dockerfiles
- Railway PostgreSQL: https://docs.railway.com/databases/postgresql
- Railway domain: https://docs.railway.com/networking/domains/working-with-domains
- Cloudflare R2 S3: https://developers.cloudflare.com/r2/get-started/s3/
- Cloudflare R2 API token: https://developers.cloudflare.com/r2/api/tokens/
- Expo APK build: https://docs.expo.dev/build-reference/apk/
- EAS környezeti változók: https://docs.expo.dev/eas/environment-variables/
