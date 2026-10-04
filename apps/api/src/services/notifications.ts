import { prisma } from "../db.js";
import { notifyUser } from "./realtime.js";

async function sendPush(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
  if (!tokens.length) return;
  const messages = tokens.map(to => ({ to, sound: "default", title, body, data: data ?? {} }));
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(messages)
    });
    if (!response.ok) console.error("Expo push failed", response.status, (await response.text()).slice(0, 500));
  } catch (error) {
    console.error("Expo push request failed", error);
  }
}

export async function createUserNotification(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  const [notification, tokens] = await Promise.all([
    prisma.notification.create({ data: { userId, title, body } }),
    prisma.pushToken.findMany({ where: { userId }, select: { token: true } })
  ]);
  notifyUser(userId, "notification", notification);
  void sendPush(tokens.map(item => item.token), title, body, data);
  return notification;
}

export async function createBroadcastNotification(title: string, body: string, data?: Record<string, unknown>) {
  const [users, tokens] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.pushToken.findMany({ select: { token: true } })
  ]);
  if (users.length) await prisma.notification.createMany({ data: users.map(user => ({ userId: user.id, title, body })) });
  for (const user of users) notifyUser(user.id, "notification", { title, body, createdAt: new Date().toISOString() });
  void sendPush(tokens.map(item => item.token), title, body, data);
}
