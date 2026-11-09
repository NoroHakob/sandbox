// No "server-only": the Trigger.dev worker reconciles before blocking a turn,
// so this uses the plain backend client and the unguarded db client

import { type BillingSubscriptionItem, createClerkClient } from "@clerk/backend"

import { creditLedger, db, type NewCreditLedgerEntry } from "@/lib/db/client"
import { describeError, logger } from "@/lib/observability"
import { NANODOLLARS_PER_DOLLAR } from "./format"

// The worker has no Next.js request for clerkClient() to read its config from
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })

export const MONTHLY_GRANT = BigInt(10) * NANODOLLARS_PER_DOLLAR

// Statuses of an item that was paid at least once. How far it ran comes from
// endedAt / pastDueAt, not the status. Free plans and trials never grant
const PAID_STATUSES = new Set<BillingSubscriptionItem["status"]>([
  "active",
  "past_due",
  "canceled",
  "ended",
  "expired",
])

function isPaid(item: BillingSubscriptionItem) {
  return (
    PAID_STATUSES.has(item.status) &&
    !item.isFreeTrial &&
    item.plan !== null &&
    !item.plan.isDefault &&
    item.plan.hasBaseFee
  )
}

const DAY = 86_400_000

// Indexes of the calendar months (UTC) the item has run, from createdAt to
// whichever comes first of endedAt, pastDueAt and now. Month 0 always counts;
// month i counts once it has begun. Every month is returned on every pass, so
// one missed visit loses nothing: the unique key drops the granted ones
function paidMonths(item: BillingSubscriptionItem, now: number) {
  const start = new Date(item.createdAt)
  const end = Math.min(item.endedAt ?? item.pastDueAt ?? now, now)
  const timeOfDay = item.createdAt % DAY
  const months: number[] = []

  for (let i = 0; ; i++) {
    const year = start.getUTCFullYear()
    const month = start.getUTCMonth() + i
    // Same day of month as createdAt, clamped: Jan 31 + 1 is Feb 28/29
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const begins =
      Date.UTC(year, month, Math.min(start.getUTCDate(), lastDay)) + timeOfDay
    if (i > 0 && begins >= end) break

    months.push(i)
  }

  return months
}

// Grants $10 for each month the org has paid for. Keyed by subscription item
// and month index, so an item's history is stable and a reload or a race can't
// grant a month twice. Returns how many months were newly granted. Never
// throws: callers are a page that must render and a turn that must not crash
export async function reconcileCredits(orgId: string) {
  try {
    const subscription =
      await clerk.billing.getOrganizationBillingSubscription(orgId)

    const now = Date.now()
    const rows: NewCreditLedgerEntry[] = subscription.subscriptionItems
      .filter(isPaid)
      .flatMap((item) =>
        paidMonths(item, now).map((index) => ({
          orgId,
          entryKey: `subscription:${item.id}:month:${index}`,
          amount: MONTHLY_GRANT,
        }))
      )
    if (rows.length === 0) return 0

    const granted = await db
      .insert(creditLedger)
      .values(rows)
      .onConflictDoNothing({
        target: [creditLedger.orgId, creditLedger.entryKey],
      })
      .returning({ entryKey: creditLedger.entryKey })

    if (granted.length > 0) {
      logger.info(logger.fmt`Granted ${granted.length} month(s) of credits`, {
        orgId,
        entryKeys: granted.map((row) => row.entryKey).join(","),
      })
    }

    return granted.length
  } catch (error) {
    logger.error("Failed to reconcile credits", {
      orgId,
      ...describeError(error),
    })
    return 0
  }
}
