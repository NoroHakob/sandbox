import "server-only"

import { eq, sql } from "drizzle-orm"

import { creditLedger, db } from "@/lib/db"
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
