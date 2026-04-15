import axios from "axios";
import * as cheerio from "cheerio";
import { logger } from "./logger";

export interface GoldSilverPrices {
  gold22k: string | null;     // per gram
  gold24k: string | null;     // per gram
  gold22k8g: string | null;   // per 8 grams (sovereign)
  silver: string | null;       // per gram
  scrapedAt: Date;
}

const SCRAPE_URL =
  process.env.SCRAPE_URL || "https://www.livechennai.com/gold_silverrate.asp";

export async function getPrices(): Promise<GoldSilverPrices> {
  try {
    logger.info("Scraping prices from livechennai.com...");

    const { data: html } = await axios.get(SCRAPE_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Referer: "https://www.livechennai.com/",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(html);

    // livechennai.com typically has a table with gold rates.
    // The structure usually has rows with:
    //   - "22 Carat Gold" / "24 Carat Gold" / "Silver"
    //   - Price columns (per gram, per 8 grams/sovereign, etc.)
    //
    // We extract text from table cells and match patterns.

    let gold22k: string | null = null;
    let gold24k: string | null = null;
    let gold22k8g: string | null = null;
    let silver: string | null = null;

    // Strategy 1: Look for table rows containing gold/silver keywords
    $("table tr, .gold_silver_table tr, .table-responsive tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;

      const label = $(cells[0]).text().trim().toLowerCase();
      const value1 = $(cells[1]).text().trim().replace(/[^\d,.]/g, "");
      const value2 = cells.length > 2 ? $(cells[2]).text().trim().replace(/[^\d,.]/g, "") : null;

      if (label.includes("22") && (label.includes("carat") || label.includes("karat") || label.includes("ct") || label.includes("k gold"))) {
        gold22k = value1 || null;
        if (value2) gold22k8g = value2;
      } else if (label.includes("24") && (label.includes("carat") || label.includes("karat") || label.includes("ct") || label.includes("k gold"))) {
        gold24k = value1 || null;
      } else if (label.includes("silver")) {
        silver = value1 || null;
      }
    });

    // Strategy 2: Fallback — scan all text for price patterns near keywords
    if (!gold22k) {
      const bodyText = $("body").text();
      
      const gold22kMatch = bodyText.match(/22\s*(?:Carat|K|ct)[\s\S]*?(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i);
      if (gold22kMatch) gold22k = gold22kMatch[1];

      const gold24kMatch = bodyText.match(/24\s*(?:Carat|K|ct)[\s\S]*?(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i);
      if (gold24kMatch) gold24k = gold24kMatch[1];

      const silverMatch = bodyText.match(/Silver[\s\S]*?(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i);
      if (silverMatch) silver = silverMatch[1];
    }

    // Strategy 3: Look for specific class names or IDs common on livechennai
    if (!gold22k) {
      // Common patterns on the site
      const goldSpan = $(".gold_rate, #gold_rate, .goldrate, .price-gold").first().text().trim();
      const silverSpan = $(".silver_rate, #silver_rate, .silverrate, .price-silver").first().text().trim();
      
      if (goldSpan) gold22k = goldSpan.replace(/[^\d,.]/g, "") || null;
      if (silverSpan) silver = silverSpan.replace(/[^\d,.]/g, "") || null;
    }

    const result: GoldSilverPrices = {
      gold22k,
      gold24k,
      gold22k8g,
      silver,
      scrapedAt: new Date(),
    };

    logger.info({ prices: result }, "Prices scraped successfully");
    return result;
  } catch (err) {
    logger.error({ err }, "Failed to scrape prices from livechennai.com");
    return {
      gold22k: null,
      gold24k: null,
      gold22k8g: null,
      silver: null,
      scrapedAt: new Date(),
    };
  }
}

// Convenience wrapper matching the old Replit API shape
export async function getSimplePrices(): Promise<{ gold: string | null; silver: string | null }> {
  const prices = await getPrices();
  return {
    gold: prices.gold22k,
    silver: prices.silver,
  };
}
