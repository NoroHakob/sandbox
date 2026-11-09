import { PricingTable } from "@clerk/nextjs"
import { auth } from "@clerk/nextjs/server"

// Stand-in until credits are metered: there is no balance to read yet
const AVAILABLE_CREDITS_USD = 8.8

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export default async function Page() {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <h1 className="text-sm font-medium">Billing</h1>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Available credits
          </h2>
          <p className="text-4xl font-semibold tracking-tight tabular-nums">
            {usd.format(AVAILABLE_CREDITS_USD)}
          </p>
          <p className="text-sm text-muted-foreground">
            Credits cover the models that build and revise your games. A build
            already in progress can finish below zero, and the next build waits
            for more credits.
          </p>
        </section>
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Keep the studio running</h2>
            <p className="text-sm text-muted-foreground">
              Builder adds $10.00 in credits every month, and unused credits
              roll over.
            </p>
          </div>
          {/* Plans live on the organization, not the user */}
          <PricingTable for="organization" />
        </section>
      </div>
    </div>
  )
}
