import dotenv from "dotenv";
dotenv.config();

import { logger } from "./logger";
import { initializeDatabase } from "./db";
import { initBot } from "./telegram-bot";
import { startPriceMonitor } from "./price-monitor";
import { startApiServer } from "./api-server";

async function main(): Promise<void> {
  logger.info("=== DigiGold Bot Starting ===");

  // Step 1: Initialize database
  initializeDatabase();

  // Step 2: Start Telegram bot
  initBot();

  // Step 3: Start price monitor (cron-based scraping + alerts)
  await startPriceMonitor();

  // Step 4: Start REST API server (for your DigiGold web app)
  startApiServer();

  logger.info("=== DigiGold Bot fully operational ===");
}

main().catch((err) => {
  logger.fatal({ err }, "Fatal error during startup");
  process.exit(1);
});
