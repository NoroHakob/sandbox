// No "server-only": the session start action and the Trigger.dev worker both
// gate builds with this. The worker has no auth(), so callers pass the org in

import { describeError, logger } from "@/lib/observability"
import { getCreditBalance } from "./ledger"
import { reconcileCredits } from "./reconcile"

// Whether the org may start a build. Only the start is gated: a build already
// running finishes, even below zero. Fails open, as a billing outage must not
// block every build
export async function canStartBuild(orgId: string) {
  try {
    if ((await getCreditBalance(orgId)) > BigInt(0)) return true

    // Grants are only written when reconciled, so a month that renewed since
    // the last visit to the billing page isn't in the balance yet
    const granted = await reconcileCredits(orgId)
    if (granted === 0) return false

    return (await getCreditBalance(orgId)) > BigInt(0)
  } catch (error) {
    logger.error("Failed to check credits before a build", {
      "org.id": orgId,
      ...describeError(error),
    })
    return true
  }
}
