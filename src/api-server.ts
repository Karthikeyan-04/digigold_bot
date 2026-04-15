import express from "express";
import cors from "cors";
import { db } from "./db";
import { priceHistoryTable } from "./schema";
import { desc } from "drizzle-orm";
import { getLastKnownPrices } from "./price-monitor";
import { getPrices } from "./price-scraper";
import { logger } from "./logger";

export function startApiServer(): void {
  const app = express();
  const port = parseInt(process.env.PORT || "3000", 10);

  app.use(cors());
  app.use(express.json());

  // Health check (Railway uses this to know the app is alive)
  app.get("/", (_req, res) => {
    res.json({
      status: "ok",
      service: "DigiGold Price API",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "healthy" });
  });

  // GET /api/prices — returns the latest cached prices (instant, no scraping)
  app.get("/api/prices", (_req, res) => {
    const prices = getLastKnownPrices();
    if (!prices) {
      res.status(503).json({
        error: "Prices not yet available. The system is still initializing.",
      });
      return;
    }
    res.json({
      gold22k: prices.gold22k,
      gold24k: prices.gold24k,
      gold22k8g: prices.gold22k8g,
      silver: prices.silver,
      updatedAt: prices.scrapedAt.toISOString(),
      source: "livechennai.com",
    });
  });

  // GET /api/prices/live — triggers a fresh scrape (use sparingly!)
  app.get("/api/prices/live", async (_req, res) => {
    try {
      const prices = await getPrices();
      res.json({
        gold22k: prices.gold22k,
        gold24k: prices.gold24k,
        gold22k8g: prices.gold22k8g,
        silver: prices.silver,
        updatedAt: prices.scrapedAt.toISOString(),
        source: "livechennai.com",
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/prices/live");
      res.status(500).json({ error: "Failed to fetch live prices" });
    }
  });

  // GET /api/prices/history?limit=50 — returns historical price data
  app.get("/api/prices/history", async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const history = await db
        .select()
        .from(priceHistoryTable)
        .orderBy(desc(priceHistoryTable.scrapedAt))
        .limit(limit);

      res.json({
        count: history.length,
        data: history.map((row) => ({
          gold22k: row.gold22k,
          gold24k: row.gold24k,
          gold22k8g: row.gold22k8g,
          silver: row.silver,
          scrapedAt: row.scrapedAt?.toISOString(),
        })),
      });
    } catch (err) {
      logger.error({ err }, "Error in /api/prices/history");
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });

  app.listen(port, "0.0.0.0", () => {
    logger.info(`API server running on port ${port}`);
  });
}
