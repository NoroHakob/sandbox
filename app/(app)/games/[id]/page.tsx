import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { ChatThread } from "@/components/chat-thread"
import { getGame } from "@/lib/games/queries"

export default async function Page(props: PageProps<"/games/[id]">) {
  await auth.protect({ unauthenticatedUrl: "/sign-in" })

  const { id } = await props.params
  const game = await getGame(id)
  if (!game) notFound()

  return (
    <ChatThread
      key={game.id}
      gameId={game.id}
      initialMessages={game.messages}
    />
  )
}
