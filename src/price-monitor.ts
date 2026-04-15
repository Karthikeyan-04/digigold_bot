import cron from "node-cron";
import { db } from "./db";
import { priceHistoryTable } from "./schema";
import { desc } from "drizzle-orm";
import { getPrices, GoldSilverPrices } from "./price-scraper";
import { sendNotification } from "./telegram-bot";
import { logger } from "./logger";

let lastKnownPrices: GoldSilverPrices | null = null;

function formatChangeMessage(
  oldPrices: GoldSilverPrices,
  newPrices: GoldSilverPrices,
): string {
  const lines: string[] = ["📢 *Price Alert — Chennai Rates Changed!*\n"];

  const items: { label: string; key: keyof GoldSilverPrices }[] = [
    { label: "🥇 Gold 22K/gm", key: "gold22k" },
    { label: "🥇 Gold 24K/gm", key: "gold24k" },
    { label: "🥈 Silver/gm", key: "silver" },
  ];

  for (const item of items) {
    const oldVal = oldPrices[item.key] as string | null;
    const newVal = newPrices[item.key] as string | null;

    if (newVal && oldVal && newVal !== oldVal) {
      const oldNum = parseFloat(oldVal.replace(/,/g, ""));
      const newNum = parseFloat(newVal.replace(/,/g, ""));
      const diff = newNum - oldNum;
      const arrow = diff > 0 ? "🔺" : "🔻";
      const sign = diff > 0 ? "+" : "";
      lines.push(`${item.label}: ₹${oldVal} → ₹${newVal} ${arrow} (${sign}${diff.toFixed(2)})`);
    } else if (newVal) {
      lines.push(`${item.label}: ₹${newVal}`);
    }
  }

  const now = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  lines.push(`\n🕐 ${now} IST`);

  return lines.join("\n");
}

async function checkAndNotify(): Promise<void> {
  try {
    const newPrices = await getPrices();

    // If scraping failed, skip
    if (!newPrices.gold22k && !newPrices.silver) {
      logger.warn("Scraping returned no data — skipping this cycle");
      return;
    }

    // Compare with last known prices BEFORE saving the new ones
    if (lastKnownPrices) {
      const changed =
        newPrices.gold22k !== lastKnownPrices.gold22k ||
        newPrices.gold24k !== lastKnownPrices.gold24k ||
        newPrices.silver !== lastKnownPrices.silver;

      if (changed) {
        logger.info("Price change detected — sending notifications");
        const message = formatChangeMessage(lastKnownPrices, newPrices);
        const result = await sendNotification(message);
        logger.info(
          { sent: result.sent, failed: result.failed },
          "Notifications sent",
        );
      } else {
        logger.debug("No price change detected");
      }
    } else {
      logger.info("First price check of this session — using as comparison baseline");
    }

    // Save to price history
    await db.insert(priceHistoryTable).values({
      gold22k: newPrices.gold22k,
      gold24k: newPrices.gold24k,
      silver: newPrices.silver,
      gold22k8g: newPrices.gold22k8g,
    });

    lastKnownPrices = newPrices;
  } catch (err) {
    logger.error({ err }, "Error in price monitoring cycle");
  }
}

async function initializeBaselineFromDb(): Promise<void> {
  try {
    const latest = await db
      .select()
      .from(priceHistoryTable)
      .orderBy(desc(priceHistoryTable.scrapedAt))
      .limit(1);

    if (latest.length > 0) {
      lastKnownPrices = {
        gold22k: latest[0].gold22k,
        gold24k: latest[0].gold24k,
        gold22k8g: latest[0].gold22k8g,
        silver: latest[0].silver,
        scrapedAt: latest[0].scrapedAt,
      };
      logger.info("Loaded previous price baseline from database");
    }
  } catch (err) {
    logger.error({ err }, "Failed to load baseline from database");
  }
}

export async function startPriceMonitor(): Promise<void> {
  const intervalMinutes = parseInt(process.env.PRICE_CHECK_INTERVAL || "5", 10);

  // Try to load existing data from DB first
  await initializeBaselineFromDb();

  // Run initial check
  await checkAndNotify();

  // Then schedule via cron
  const cronExpression = `*/${intervalMinutes} * * * *`;
  cron.schedule(cronExpression, () => {
    checkAndNotify();
  });

  logger.info(
    `Price monitor started — checking every ${intervalMinutes} minutes`,
  );
}

// Export for API use
export function getLastKnownPrices(): GoldSilverPrices | null {
  return lastKnownPrices;
}
