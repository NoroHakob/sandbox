// No "server-only": the Trigger.dev worker charges steps from here, so this
// imports the unguarded client

import { eq, sql } from "drizzle-orm"

import { creditLedger, db } from "@/lib/db/client"
import { NANODOLLARS_PER_DOLLAR } from "./format"

// Every org starts with $1. It is not a ledger row, so it can never be granted
// twice or need a backfill
export const FREE_CREDITS = NANODOLLARS_PER_DOLLAR

export async function getCreditBalance(orgId: string) {
  // Postgres sums a bigint column as numeric, which pg returns as a string
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${creditLedger.amount}), 0)`,
    })
    .from(creditLedger)
    .where(eq(creditLedger.orgId, orgId))

  return FREE_CREDITS + BigInt(row?.total ?? "0")
}

// Records a model step's cost as spend. Keyed by the provider's response id,
// so a retried or replayed step collides on the unique key instead of charging
// twice. Returns whether a row was written
export async function chargeStep({
  orgId,
  responseId,
  amount,
}: {
  orgId: string
  responseId: string
  // Nanodollars, positive
  amount: bigint
}) {
  if (amount <= BigInt(0)) return false

  const inserted = await db
    .insert(creditLedger)
    .values({ orgId, entryKey: `step:${responseId}`, amount: -amount })
    .onConflictDoNothing({
      target: [creditLedger.orgId, creditLedger.entryKey],
    })
    .returning({ id: creditLedger.id })

  return inserted.length > 0
}
