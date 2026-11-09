import type { UIMessage } from "ai"
import { desc } from "drizzle-orm"
import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core"

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk organization id, not a foreign key
    orgId: text("org_id").notNull(),
    title: text("title").notNull(),
    // Full chat thread for this game, in useChat UIMessage format
    messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),
    // Trigger.dev chat session state, so a reload resumes the stream
    chatAccessToken: text("chat_access_token"),
    chatLastEventId: text("chat_last_event_id"),
    // Daytona sandbox holding this game's files
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("games_org_id_created_at_idx").on(table.orgId, desc(table.createdAt)),
  ]
)

export type Game = typeof games.$inferSelect
export type NewGame = typeof games.$inferInsert

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Clerk organization id, not a foreign key
    orgId: text("org_id").notNull(),
    // What the row is for, e.g. "step:<responseId>" or
    // "grant:<subscriptionItemId>:<month>"
    entryKey: text("entry_key").notNull(),
    // Billionths of a dollar (nanodollars): integer math with no float
    // rounding, fine enough for per-token prices. Negative for spend,
    // positive for grants. bigint mode so values past 2^53 stay exact.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One row per (org, entry key): a retried write collides here instead
    // of double counting
    unique("credit_ledger_org_id_entry_key_unique").on(
      table.orgId,
      table.entryKey
    ),
  ]
)

export type CreditLedgerEntry = typeof creditLedger.$inferSelect
export type NewCreditLedgerEntry = typeof creditLedger.$inferInsert
