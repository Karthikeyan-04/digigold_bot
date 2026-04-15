import TelegramBot from "node-telegram-bot-api";
import { db } from "./db";
import { subscribersTable } from "./schema";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { getSimplePrices, getPrices } from "./price-scraper";

let bot: TelegramBot | null = null;

export function getBot(): TelegramBot | null {
  return bot;
}

export async function sendNotification(
  message: string,
): Promise<{ sent: number; failed: number }> {
  if (!bot) {
    throw new Error("Bot is not initialized");
  }

  const subscribers = await db
    .select()
    .from(subscribersTable)
    .where(eq(subscribersTable.active, true));

  let sent = 0;
  let failed = 0;

  for (const sub of subscribers) {
    try {
      await bot.sendMessage(sub.chatId, message, { parse_mode: "Markdown" });
      sent++;
    } catch (err) {
      logger.error(
        { err, chatId: sub.chatId },
        "Failed to send notification to subscriber",
      );
      failed++;
      if ((err as { code?: string }).code === "ETELEGRAM") {
        await db
          .update(subscribersTable)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(subscribersTable.chatId, sub.chatId));
      }
    }
  }

  return { sent, failed };
}

export function initBot(): void {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot will not start");
    return;
  }

  bot = new TelegramBot(token, { polling: true });

  // /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from?.first_name ?? "there";

    await bot!.sendMessage(
      chatId,
      `👋 Hello, *${firstName}*\\!\n\nThis is a DigiGold notification bot\\. Use the commands below:\n\n/checkprice — get current gold & silver rates\n/subscribe — receive automatic price alerts\n/unsubscribe — stop receiving alerts\n/status — check your subscription status`,
      { parse_mode: "MarkdownV2" },
    );
  });

  // /checkprice command
  bot.onText(/\/checkprice/, async (msg) => {
    const chatId = msg.chat.id;
    await bot!.sendMessage(chatId, "🔍 Fetching latest prices...");
    try {
      const prices = await getPrices();
      if (!prices.gold22k && !prices.silver) {
        await bot!.sendMessage(
          chatId,
          "❌ Could not fetch prices right now. Please try again later.",
        );
        return;
      }
      const now = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        dateStyle: "medium",
        timeStyle: "short",
      });

      let priceMsg = `*Live Chennai Rates*\n\n`;
      if (prices.gold22k) priceMsg += `🥇 Gold (22K/gm): ₹${prices.gold22k}\n`;
      if (prices.gold24k) priceMsg += `🥇 Gold (24K/gm): ₹${prices.gold24k}\n`;
      if (prices.gold22k8g) priceMsg += `🪙 Gold (22K/8gm): ₹${prices.gold22k8g}\n`;
      if (prices.silver) priceMsg += `🥈 Silver (1gm): ₹${prices.silver}\n`;
      priceMsg += `\n🕐 Updated: ${now} IST`;

      await bot!.sendMessage(chatId, priceMsg, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error({ err, chatId }, "Error handling /checkprice");
      await bot!.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again.",
      );
    }
  });

  // /subscribe command
  bot.onText(/\/subscribe/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from?.username ?? null;
    const firstName = msg.from?.first_name ?? null;

    try {
      const existing = await db
        .select()
        .from(subscribersTable)
        .where(eq(subscribersTable.chatId, chatId));

      if (existing.length > 0) {
        if (existing[0].active) {
          await bot!.sendMessage(
            chatId,
            "✅ You are already subscribed to notifications.",
          );
        } else {
          await db
            .update(subscribersTable)
            .set({ active: true, username, firstName, updatedAt: new Date() })
            .where(eq(subscribersTable.chatId, chatId));
          await bot!.sendMessage(
            chatId,
            "🔔 Welcome back! You have been re-subscribed to notifications.",
          );
        }
      } else {
        await db
          .insert(subscribersTable)
          .values({ chatId, username, firstName, active: true });
        await bot!.sendMessage(
          chatId,
          "✅ You are now subscribed! You will receive notifications here.",
        );
      }
    } catch (err) {
      logger.error({ err, chatId }, "Error handling /subscribe");
      await bot!.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again.",
      );
    }
  });

  // /unsubscribe command
  bot.onText(/\/unsubscribe/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const existing = await db
        .select()
        .from(subscribersTable)
        .where(eq(subscribersTable.chatId, chatId));

      if (existing.length === 0 || !existing[0].active) {
        await bot!.sendMessage(chatId, "ℹ️ You are not currently subscribed.");
      } else {
        await db
          .update(subscribersTable)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(subscribersTable.chatId, chatId));
        await bot!.sendMessage(
          chatId,
          "🔕 You have been unsubscribed. Use /subscribe to re-subscribe anytime.",
        );
      }
    } catch (err) {
      logger.error({ err, chatId }, "Error handling /unsubscribe");
      await bot!.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again.",
      );
    }
  });

  // /status command
  bot.onText(/\/status/, async (msg) => {
    const chatId = msg.chat.id;

    try {
      const existing = await db
        .select()
        .from(subscribersTable)
        .where(eq(subscribersTable.chatId, chatId));

      if (existing.length === 0 || !existing[0].active) {
        await bot!.sendMessage(
          chatId,
          "🔕 You are *not* subscribed to notifications.\n\nUse /subscribe to start receiving them.",
          { parse_mode: "Markdown" },
        );
      } else {
        const since = existing[0].createdAt.toLocaleDateString("en-US", {
          dateStyle: "medium",
        });
        await bot!.sendMessage(
          chatId,
          `✅ You are *subscribed* to notifications.\n\nSubscribed since: ${since}`,
          { parse_mode: "Markdown" },
        );
      }
    } catch (err) {
      logger.error({ err, chatId }, "Error handling /status");
      await bot!.sendMessage(
        chatId,
        "❌ Something went wrong. Please try again.",
      );
    }
  });

  // /testnotify command (for verification)
  bot.onText(/\/testnotify/, async (msg) => {
    const chatId = msg.chat.id;
    logger.info({ chatId }, "Sending test notification");
    
    const sampleMessage = `📢 *Test Price Alert — System Check*\n\n🥇 Gold 22K/gm: ₹7,150 → ₹7,200 🔺 (+50.00)\n🥇 Gold 24K/gm: ₹7,800\n🥈 Silver/gm: ₹98.50 → ₹99.00 🔺 (+0.50)\n\n🕐 This is a test notification to verify your connection.`;
    
    try {
      await bot!.sendMessage(chatId, sampleMessage, { parse_mode: "Markdown" });
      await bot!.sendMessage(chatId, "✅ Test notification sent successfully!");
    } catch (err) {
      logger.error({ err, chatId }, "Error sending test notification");
      await bot!.sendMessage(chatId, "❌ Failed to send test notification. Check bot permissions.");
    }
  });

  // Set command menu
  bot.setMyCommands([
    { command: "checkprice", description: "Get current gold & silver rates" },
    { command: "subscribe", description: "Subscribe to automatic price alerts" },
    { command: "unsubscribe", description: "Stop receiving price alerts" },
    { command: "status", description: "Check your subscription status" },
    { command: "testnotify", description: "Send a test notification (Baseline/Connection check)" },
  ]).catch(err => logger.error({ err }, "Failed to set bot commands"));

  bot.on("polling_error", (err) => {
    logger.error({ err }, "Telegram bot polling error");
  });

  logger.info("Telegram bot started (polling)");
}
