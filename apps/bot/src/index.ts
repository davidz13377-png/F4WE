import { randomInt } from "node:crypto";
import { Client, EmbedBuilder, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { PrismaClient, Rank } from "@prisma/client";
import { authorized, env } from "./env.js";
import { importQueuedRequests } from "./importRequests.js";
import { downloadLyricsFile, type LyricsType } from "./lyrics.js";

const prisma = new PrismaClient();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const hierarchy = { Access: 0, Moderator: 1, Admin: 2, Developer: 3 } as const;
const OWNER_DISCORD_ID = "1141698223141048463";
type BotRank = keyof typeof hierarchy;

const commands = [
  new SlashCommandBuilder().setName("genkey").setDescription("Generate a single-use F4WE access key"),
  new SlashCommandBuilder().setName("customkey").setDescription("Create a named F4WE key with a usage limit")
    .addStringOption(o => o.setName("key").setDescription("3-64 letters, numbers, _ or -").setMinLength(3).setMaxLength(64).setRequired(true))
    .addIntegerOption(o => o.setName("uses").setDescription("How many accounts may register (1-100)").setMinValue(1).setMaxValue(100).setRequired(true)),
  new SlashCommandBuilder().setName("rangadd").setDescription("Change a F4WE user's rank")
    .addStringOption(o => o.setName("user_id").setDescription("16-digit app user ID").setRequired(true))
    .addStringOption(o => o.setName("rank").setDescription("New rank").setRequired(true).addChoices(
      { name: "Access", value: "Access" }, { name: "Moderator", value: "Moderator" }, { name: "Admin", value: "Admin" }, { name: "Developer", value: "Developer" }
    )),
  new SlashCommandBuilder().setName("addowner").setDescription("Grant protected Owner alongside the existing app rank")
    .addStringOption(o => o.setName("user_id").setDescription("16-digit app user ID").setRequired(true)),
  new SlashCommandBuilder().setName("list").setDescription("List registered users")
    .addStringOption(o => o.setName("rank").setDescription("Optional rank filter").addChoices(
      { name: "Access", value: "Access" }, { name: "Moderator", value: "Moderator" }, { name: "Admin", value: "Admin" }, { name: "Developer", value: "Developer" }
    ))
    .addStringOption(o => o.setName("search").setDescription("Username or 16-digit ID"))
    .addStringOption(o => o.setName("sort").setDescription("Sort direction").addChoices({ name: "Newest", value: "desc" }, { name: "Oldest", value: "asc" })),
  new SlashCommandBuilder().setName("keylist").setDescription("Show access-key totals"),
  new SlashCommandBuilder().setName("validkey").setDescription("List currently unused access keys"),
  new SlashCommandBuilder().setName("szoveg").setDescription("Dalszöveg hozzáadása egy F4WE zenéhez")
    .addStringOption(o => o.setName("tipus").setDescription("A dalszöveg típusa").setRequired(true).addChoices(
      { name: "Követős (.lrc)", value: "timed" }, { name: "Sima szöveg (.txt)", value: "plain" }
    ))
    .addStringOption(o => o.setName("zene").setDescription("Az appban látható pontos zenecím vagy zene-ID").setMinLength(1).setMaxLength(150).setRequired(true))
    .addAttachmentOption(o => o.setName("fajl").setDescription("A feltöltendő .lrc vagy .txt fájl").setRequired(true)),
  new SlashCommandBuilder().setName("logstart").setDescription("Activate every F4WE logging channel")
].map(command => command.toJSON());

function requireBotRank(interaction: ChatInputCommandInteraction, required: BotRank) {
  const actual = authorized.get(interaction.user.id) as BotRank | undefined;
  const level = actual ? hierarchy[actual] : undefined;
  if (level === undefined || level < hierarchy[required]) {
    void interaction.editReply({ content: "Unauthorized" });
    return false;
  }
  return true;
}

async function queueDebug(actionType: string, details: object) {
  await prisma.logEvent.create({ data: { type: "DEBUG", userId: null, actionType, details } }).catch(error => console.error("Could not queue debug event", error));
}

function accessKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 16 }, () => chars[randomInt(chars.length)]).join("");
}

async function uniqueAccessKey() {
  for (let i = 0; i < 10; i++) {
    const key = accessKey();
    if (!(await prisma.accessKey.findUnique({ where: { key } }))) return key;
  }
  throw new Error("Could not generate a unique key");
}

async function onCommand(interaction: ChatInputCommandInteraction) {
  if (interaction.commandName === "addowner") {
    if (interaction.user.id !== OWNER_DISCORD_ID) return interaction.editReply({ content: "Only the designated Discord owner can run /addowner." });
    const userId = interaction.options.getString("user_id", true);
    if (!/^\d{16}$/.test(userId)) return interaction.editReply({ content: "User ID must contain exactly 16 digits." });
    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) return interaction.editReply({ content: "User not found." });
    if (current.isOwner) return interaction.editReply({ content: "This account already has Owner." });
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { isOwner: true } }),
      prisma.notification.create({ data: { userId, title: "Owner granted", body: `Your account is now Owner + ${current.rank}.` } }),
      prisma.logEvent.create({ data: { type: "RANK_CHANGE", userId, actionType: "user.owner_granted", details: { grantedByDiscordId: interaction.user.id, rank: current.rank } } })
    ]);
    return interaction.editReply({ content: `${current.username} is now **Owner + ${current.rank}**.` });
  }
  if (!authorized.has(interaction.user.id)) return interaction.editReply({ content: "Unauthorized" });

  if (interaction.commandName === "genkey") {
    if (!requireBotRank(interaction, "Admin")) return;
    const key = await uniqueAccessKey();
    await prisma.$transaction([
      prisma.accessKey.create({ data: { key, createdByDiscordId: interaction.user.id } }),
      prisma.logEvent.create({ data: { type: "KEY_GENERATION", userId: interaction.user.id, actionType: "access_key.generated", details: { key, generatedByDiscordId: interaction.user.id } } })
    ]);
    return interaction.editReply({ content: `Access key: \`${key}\`\nSingle use only.` });
  }

  if (interaction.commandName === "customkey") {
    if (!requireBotRank(interaction, "Admin")) return;
    const key = interaction.options.getString("key", true).trim();
    const usageLimit = interaction.options.getInteger("uses", true);
    if (!/^[A-Za-z0-9_-]{3,64}$/.test(key)) return interaction.editReply({ content: "Key must be 3-64 letters, numbers, _ or -." });
    if (await prisma.accessKey.findUnique({ where: { key }, select: { key: true } })) return interaction.editReply({ content: "That key already exists." });
    await prisma.$transaction([
      prisma.accessKey.create({ data: { key, usageLimit, createdByDiscordId: interaction.user.id } }),
      prisma.logEvent.create({ data: { type: "KEY_GENERATION", userId: interaction.user.id, actionType: "access_key.custom_generated", details: { key, usageLimit, generatedByDiscordId: interaction.user.id } } })
    ]);
    return interaction.editReply({ content: `Custom key: \`${key}\`\nCan activate **${usageLimit}** accounts.` });
  }

  if (interaction.commandName === "rangadd") {
    if (!requireBotRank(interaction, "Developer")) return;
    const userId = interaction.options.getString("user_id", true);
    const rank = interaction.options.getString("rank", true) as Rank;
    if (!/^\d{16}$/.test(userId)) return interaction.editReply({ content: "User ID must contain exactly 16 digits." });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return interaction.editReply({ content: "User not found." });
    if (user.isOwner) return interaction.editReply({ content: "Owner accounts cannot be demoted or changed with /rangadd." });
    const changed = await prisma.$transaction(async tx => {
      const updated = await tx.user.updateMany({ where: { id: userId, isOwner: false }, data: { rank } });
      if (!updated.count) return false;
      await tx.userRanksHistory.create({ data: { userId, oldRank: user.rank, newRank: rank, actorLabel: `discord:${interaction.user.id}` } });
      await tx.notification.create({ data: { userId, title: "Rank updated", body: `Your rank is now ${rank}.` } });
      await tx.logEvent.create({ data: { type: "RANK_CHANGE", userId, actionType: "user.rank_changed", details: { oldRank: user.rank, newRank: rank, changedByDiscordId: interaction.user.id } } });
      return true;
    });
    if (!changed) return interaction.editReply({ content: "Owner accounts cannot be demoted." });
    return interaction.editReply({ content: `${user.username} is now **${rank}**.` });
  }

  if (interaction.commandName === "list") {
    if (!requireBotRank(interaction, "Admin")) return;
    const rank = interaction.options.getString("rank") as Rank | null;
    const search = interaction.options.getString("search")?.trim();
    const sort = interaction.options.getString("sort") === "asc" ? "asc" : "desc";
    const users = await prisma.user.findMany({
      where: { rank: rank ?? undefined, OR: search ? [{ username: { contains: search, mode: "insensitive" } }, { id: { contains: search } }] : undefined },
      orderBy: { registrationDate: sort }, take: 25,
      select: { id: true, username: true, rank: true, isOwner: true, registrationDate: true }
    });
    const description = users.length ? users.map(u => `\`${u.id}\` • **${u.username}** • ${u.isOwner ? "Owner + " : ""}${u.rank} • <t:${Math.floor(u.registrationDate.getTime() / 1000)}:f>`).join("\n") : "No matching users.";
    return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`F4WE users (${users.length})`).setDescription(description).setColor(0xffffff)] });
  }

  if (interaction.commandName === "keylist") {
    if (!requireBotRank(interaction, "Admin")) return;
    const [total, exhausted, totals] = await Promise.all([
      prisma.accessKey.count(), prisma.accessKey.count({ where: { used: true } }),
      prisma.accessKey.aggregate({ _sum: { usageLimit: true, usedCount: true } })
    ]);
    const remainingUses = (totals._sum.usageLimit ?? 0) - (totals._sum.usedCount ?? 0);
    return interaction.editReply({ content: `Generated keys: **${total}**\nFully used: **${exhausted}**\nValid keys: **${total - exhausted}**\nRemaining activations: **${remainingUses}**` });
  }

  if (interaction.commandName === "validkey") {
    if (!requireBotRank(interaction, "Admin")) return;
    const keys = await prisma.accessKey.findMany({ where: { used: false }, orderBy: { createdDate: "desc" }, take: 50 });
    const content = keys.length ? keys.map(k => `\`${k.key}\` • **${k.usageLimit - k.usedCount}/${k.usageLimit}** uses left • <t:${Math.floor(k.createdDate.getTime() / 1000)}:R>`).join("\n") : "No valid keys.";
    return interaction.editReply({ content });
  }

  if (interaction.commandName === "szoveg") {
    if (!requireBotRank(interaction, "Moderator")) return;
    const type = interaction.options.getString("tipus", true) as LyricsType;
    const songQuery = interaction.options.getString("zene", true).trim();
    const attachment = interaction.options.getAttachment("fajl", true);
    const songs = await prisma.music.findMany({
      where: { OR: [{ id: songQuery }, { title: { equals: songQuery, mode: "insensitive" } }] },
      orderBy: { uploadDate: "desc" },
      take: 6,
      select: { id: true, title: true, artist: true }
    });
    if (!songs.length) return interaction.editReply({ content: `Nem található zene ezzel a pontos címmel vagy ID-val: **${songQuery}**` });

    const idMatch = songs.find(song => song.id === songQuery);
    if (!idMatch && songs.length > 1) {
      const matches = songs.map(song => `\`${song.id}\` • **${song.title}**${song.artist ? ` — ${song.artist}` : ""}`).join("\n");
      return interaction.editReply({ content: `Több zene is pontosan ezt a címet használja. Futtasd újra a parancsot, és a **zene** mezőbe másold a megfelelő ID-t:\n${matches}` });
    }

    const song = idMatch ?? songs[0]!;
    const content = await downloadLyricsFile(attachment, type);
    await prisma.$transaction([
      prisma.music.update({ where: { id: song.id }, data: { lyrics: content, lyricsSynced: type === "timed" } }),
      prisma.logEvent.create({
        data: {
          type: "MUSIC_UPLOAD",
          userId: interaction.user.id,
          actionType: "music.lyrics_updated_from_discord",
          details: { musicId: song.id, title: song.title, lyricsType: type, filename: attachment.name, updatedByDiscordId: interaction.user.id }
        }
      })
    ]);
    return interaction.editReply({ content: `Kész: **${song.title}** dalszövege feltöltve (${type === "timed" ? "követős .lrc" : "sima .txt"}). Az app a következő megnyitáskor/frissítéskor már betölti.` });
  }

  if (interaction.commandName === "logstart") {
    if (!requireBotRank(interaction, "Developer")) return;
    await prisma.systemSetting.upsert({ where: { key: "logging.enabled" }, create: { key: "logging.enabled", value: "true" }, update: { value: "true" } });
    for (const [type, channelId] of Object.entries(channelMap)) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel?.isSendable()) await channel.send(`[${type}] Log is now ON`);
    }
    return interaction.editReply({ content: "All logging channels are active." });
  }
}

const channelMap: Record<string, string> = {
  BUG_REPORT: env.BUG_REPORT_LOG_CHANNEL,
  MUSIC_REQUEST: env.MUSIC_REQUEST_LOG_CHANNEL,
  USER_REGISTRATION: env.USER_REGISTRATION_LOG_CHANNEL,
  KEY_GENERATION: env.KEY_GENERATION_LOG_CHANNEL,
  MUSIC_UPLOAD: env.MUSIC_UPLOAD_LOG_CHANNEL,
  RANK_CHANGE: env.RANK_CHANGE_LOG_CHANNEL,
  DEBUG: env.DEBUG_LOG_CHANNEL
};

async function flushLogs() {
  const enabled = await prisma.systemSetting.findUnique({ where: { key: "logging.enabled" } });
  if (enabled?.value !== "true") return;
  const events = await prisma.logEvent.findMany({ where: { deliveredAt: null, attempts: { lt: 10 } }, orderBy: { createdAt: "asc" }, take: 25 });
  for (const event of events) {
    try {
      const channel = await client.channels.fetch(channelMap[event.type] ?? "");
      if (!channel?.isSendable()) throw new Error(`Missing text channel for ${event.type}`);
      const payload = JSON.stringify({ timestamp: event.createdAt.toISOString(), user_id: event.userId, action_type: event.actionType, details: event.details }, null, 2);
      await channel.send(`\`\`\`json\n${payload.slice(0, 1900)}\n\`\`\``);
      await prisma.logEvent.update({ where: { id: event.id }, data: { deliveredAt: new Date(), attempts: { increment: 1 } } });
    } catch (error) {
      console.error("Log delivery failed", event.id, error);
      await prisma.logEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
    }
  }
}

client.once(Events.ClientReady, async () => {
  await client.application?.commands.set(commands, env.DISCORD_SERVER_ID);
  console.log(`Discord bot ready as ${client.user?.tag}`);
  setInterval(() => void flushLogs(), 3_000);
  setInterval(() => void importQueuedRequests(prisma).catch(error => console.error("Music request worker failed", error)), 5_000);
});
client.on(Events.InteractionCreate, interaction => {
  if (!interaction.isChatInputCommand()) return;
  void interaction.deferReply({ flags: MessageFlags.Ephemeral }).then(() => onCommand(interaction)).catch(async error => {
    console.error(error);
    await prisma.logEvent.create({ data: { type: "DEBUG", userId: interaction.user.id, actionType: "bot.command_failed", details: { command: interaction.commandName, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack?.slice(0, 4000) : undefined } } }).catch(console.error);
    const message = { content: "Command failed. Check the bot logs." } as const;
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(message).catch(() => undefined);
    } else {
      await interaction.reply({ ...message, flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  });
});

await client.login(env.DISCORD_BOT_TOKEN);

process.on("unhandledRejection", reason => {
  console.error("Unhandled bot rejection", reason);
  void queueDebug("bot.unhandled_rejection", { error: reason instanceof Error ? reason.message : String(reason), stack: reason instanceof Error ? reason.stack ?? null : null });
});
