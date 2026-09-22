# F4WE

F4WE is a native Android/iOS music-streaming application with a monochrome dark interface, a secured Node.js API, PostgreSQL database, and a Discord administration/logging bot.

## Included features

- Username/password authentication with single-use or named multi-use Discord-generated access keys
- Unique 16-digit application user IDs
- Access, Moderator, Admin, and Developer roles with server-side authorization
- Search, favorites, public/private user albums, saved albums, queues, and background/lock-screen playback
- Authenticated MP3 byte-range streaming with Play, Pause, Previous, Next, and Seek support
- Profile images, rank badges, copyable user IDs, and in-app notifications
- Music request and bug-report histories with staff acceptance, resolution, rejection reasons, and notifications
- Developer update feed with create, edit, and delete controls
- Staff portal, music uploader, developer user search, and rank manager
- Discord `/genkey`, `/customkey`, `/rangadd`, `/list`, `/keylist`, `/validkey`, and `/logstart` commands
- Seven independent JSON log streams, including debugger events, delivered to configured Discord channels
- bcrypt password hashing, JWT sessions, current-rank database checks, input validation, file-signature validation, Helmet, CORS, and rate limiting

## Architecture

```text
apps/mobile   Expo + React Native + Expo Router + Track Player
apps/api      Express 5 + Prisma + Socket.IO + local/private MP3 storage
apps/bot      Discord.js bot and Discord log dispatcher
```

Both the API and bot use the same PostgreSQL schema. Rank changes made by the bot are detected by the API and pushed to connected applications.

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop (recommended for local PostgreSQL)
- Android Studio or Xcode for a native development build
- A Discord application/bot and private logging server

`react-native-track-player` contains native code, so use an Expo development build (`expo run:android` / `expo run:ios`), not Expo Go.

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and replace every secret or placeholder. Generate a strong JWT secret, for example with `openssl rand -base64 48`.

3. Start PostgreSQL and deploy the included migration:

   ```bash
   docker compose up -d postgres
   npm run db:generate
   npm --workspace @music-box/api run db:deploy
   ```

4. Start the API and Discord bot in separate terminals:

   ```bash
   npm run dev:api
   npm run dev:bot
   ```

5. Set the mobile API address. Copy `apps/mobile/.env.example` to `apps/mobile/.env`. For a physical phone, use your computer's LAN address, such as `http://192.168.1.20:4000`. Android Emulator can use `http://10.0.2.2:4000`.

6. Build and run the native app:

   ```bash
   npm run dev:mobile
   npm --workspace @music-box/mobile run android
   ```

   On macOS, replace `android` with `ios` when needed.

## Discord setup

1. Create an application at [Discord Developer Portal](https://discord.com/developers/applications), add a bot, and copy its token to `DISCORD_BOT_TOKEN`.
2. Create a private Discord server and these text channels:
   - `bug-report-logs`
   - `music-request-logs`
   - `user-registration-logs`
   - `key-generation-logs`
   - `music-upload-logs`
   - `rank-change-logs`
3. Enable Discord Developer Mode, copy the guild/channel IDs, and put them in `.env`.
4. Invite the bot with the `bot` and `applications.commands` OAuth2 scopes. Grant View Channels, Send Messages, Embed Links, and Read Message History.
5. Put authorized Discord IDs in `AUTHORIZED_USER_IDS` and matching roles in `AUTHORIZED_USER_RANKS`. Values are positional:

   ```env
   AUTHORIZED_USER_IDS=111111111111111111,222222222222222222
   AUTHORIZED_USER_RANKS=Developer,Admin
   ```

6. Run the bot, then use `/logstart`. A Discord-authorized Admin or Developer can create the first access key with `/genkey`. After registering in the app, an authorized Developer can promote that user with `/rangadd`.

### Command permissions

| Command | Minimum Discord authorization |
| --- | --- |
| `/genkey` | Admin |
| `/customkey` | Admin |
| `/rangadd` | Developer |
| `/list` | Admin |
| `/keylist` | Admin |
| `/validkey` | Admin |
| `/logstart` | Developer |

Unauthorized Discord users always receive an ephemeral `Unauthorized` response.

## Environment variables

The root `.env.example` documents every API and bot variable. Important production values:

- `DATABASE_URL`: PostgreSQL connection URL
- `JWT_SECRET`: at least 32 random characters
- `PUBLIC_API_URL`: externally reachable HTTPS API base URL
- `CORS_ORIGINS`: comma-separated allowed origins
- `UPLOAD_DIR`: persistent directory for MP3 and profile files
- `MAX_MP3_MB`: maximum accepted MP3 size
- Discord bot, guild, user, and logging-channel IDs

Never commit `.env` or a Discord token.

## Production deployment notes

- Terminate TLS at a reverse proxy and expose only HTTPS.
- Mount `UPLOAD_DIR` on persistent storage. For multiple API replicas, replace the local file adapter with S3-compatible object storage/CDN while keeping the same authenticated streaming route.
- Run `prisma migrate deploy` during releases, never `migrate dev` on production.
- Run the API and bot as separate services with automatic restart and health monitoring (`GET /health`).
- Back up PostgreSQL and uploaded media. Rotate `JWT_SECRET` and Discord credentials through your secret manager.
- Configure platform privacy disclosures and obtain distribution rights for every uploaded song. This repository does not include copyrighted music.

## Verification

```bash
npm run typecheck
npm --workspace @music-box/api run build
npm --workspace @music-box/bot run build
npx expo config --type public
```

The repository includes a generated initial PostgreSQL migration under `apps/api/prisma/migrations`.
