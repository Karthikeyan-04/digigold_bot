import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const subscribersTable = sqliteTable("subscribers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const priceHistoryTable = sqliteTable("price_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gold22k: text("gold_22k"),        // price per gram
  gold24k: text("gold_24k"),        // price per gram
  silver: text("silver"),            // price per gram
  gold22k8g: text("gold_22k_8g"),   // price per 8 grams (sovereign)
  scrapedAt: integer("scraped_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
