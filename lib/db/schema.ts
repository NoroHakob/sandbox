import type { UIMessage } from "ai"
import { desc } from "drizzle-orm"
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
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
