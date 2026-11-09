import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { GameChat } from "@/components/game-chat"
import { GameHeader } from "@/components/game-header"
import { defaultGameModelId, isGameModelId } from "@/lib/games/model-catalog"
import { getGame } from "@/lib/games/queries"

export default async function Page(props: PageProps<"/games/[id]">) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await props.params
  const game = await getGame(id)
  if (!game) notFound()

  const { model } = await props.searchParams

  return (
    <div className="flex h-svh flex-col">
      <GameHeader gameId={game.id} title={game.title} />
      <GameChat
        key={game.id}
        gameId={game.id}
        sandboxId={game.sandboxId}
        initialModelId={isGameModelId(model) ? model : defaultGameModelId}
        initialMessages={game.messages}
        session={
          game.chatAccessToken
            ? {
                publicAccessToken: game.chatAccessToken,
                lastEventId: game.chatLastEventId ?? undefined,
              }
            : undefined
        }
      />
    </div>
  )
}
