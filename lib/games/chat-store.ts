import type { UIMessage } from "ai"
import { eq } from "drizzle-orm"

import { db, games } from "@/lib/db/client"

// Used by the Trigger.dev worker, which has no Clerk session. The chat id is
// the game id, and ownership was checked when the session was started.

export async function getGameMessages(id: string) {
  const [game] = await db
    .select({ messages: games.messages })
    .from(games)
    .where(eq(games.id, id))
    .limit(1)

  return game?.messages ?? null
}

export async function getGameSandboxId(id: string) {
  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, id))
    .limit(1)

  return game?.sandboxId ?? null
}

export async function saveGameMessages(id: string, messages: UIMessage[]) {
  await db.update(games).set({ messages }).where(eq(games.id, id))
}

export async function saveGameChatAccessToken(
  id: string,
  chatAccessToken: string
) {
  await db.update(games).set({ chatAccessToken }).where(eq(games.id, id))
}

export async function saveGameChat({
  id,
  messages,
  chatAccessToken,
  chatLastEventId,
}: {
  id: string
  messages: UIMessage[]
  chatAccessToken: string
  chatLastEventId: string | undefined
}) {
  await db
    .update(games)
    // Leave a known cursor in place rather than clearing it
    .set({
      messages,
      chatAccessToken,
      ...(chatLastEventId && { chatLastEventId }),
    })
    .where(eq(games.id, id))
}
