import { auth } from "@clerk/nextjs/server"
import Image from "next/image"
import { redirect } from "next/navigation"

import { NewGameComposer } from "@/components/new-game-composer"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { getLatestGame } from "@/lib/games/queries"
import { suggestions } from "@/lib/games/suggestions"

// The home page reopens a game active within this window
const REOPEN_GAME_WINDOW_MS = 30 * 60 * 1000

export default async function Page(props: PageProps<"/">) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  // ?new asks for the composer explicitly, e.g. from the "New game" button
  const { new: requestedNew } = await props.searchParams
  if (requestedNew === undefined) {
    const game = await getLatestGame()
    // eslint-disable-next-line react-hooks/purity -- server component, renders once per request, so the clock read can't make re-renders diverge
    if (game && Date.now() - game.updatedAt.getTime() < REOPEN_GAME_WINDOW_MS) {
      redirect(`/games/${game.id}`)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6">
      <Empty className="flex-none">
        <EmptyHeader>
          <EmptyMedia>
            <Image src="/logo.svg" alt="Logo" width={48} height={48} />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">
            What should we build today?
          </EmptyTitle>
          <EmptyDescription>
            Build your own racers, shooters, puzzles and whole worlds using your
            own words. If you can describe it, you can play it.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-3xl gap-6">
          <NewGameComposer />
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map(({ icon: Icon, label }) => (
              <Button key={label} variant="outline" className="rounded-full">
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
