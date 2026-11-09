import { auth } from "@clerk/nextjs/server"

import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { formatCredits } from "@/lib/billing/format"
import { getCreditBalance } from "@/lib/billing/ledger"
import { listGames } from "@/lib/games/queries"

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { orgId } = await auth()
  const [games, balance] = await Promise.all([
    listGames(),
    orgId ? getCreditBalance(orgId) : null,
  ])

  return (
    <SidebarProvider>
      <AppSidebar
        games={games}
        credits={balance === null ? null : formatCredits(balance)}
      />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  )
}
