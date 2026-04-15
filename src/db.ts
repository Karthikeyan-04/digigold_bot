import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { logger } from "./logger";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_URL || "./data/digigold.db";

// Ensure the data directory exists
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
  logger.info(`Created database directory: ${dir}`);
}

const sqlite = new Database(dbPath);

// Enable WAL mode for better concurrent access
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// Auto-create tables if they don't exist
export function initializeDatabase(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL UNIQUE,
      username TEXT,
      first_name TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      gold_22k TEXT,
      gold_24k TEXT,
      silver TEXT,
      gold_22k_8g TEXT,
      scraped_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  logger.info("Database initialized successfully");
}
