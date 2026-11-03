"use server"

import { auth } from "@clerk/nextjs/server"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat } from "@trigger.dev/sdk/ai"

import { getGame } from "@/lib/games/queries"
import type { gameChat } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof gameChat>("game-chat")

// The chat id is the game id, so owning the game authorizes the chat
async function requireGame(chatId: string) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const game = await getGame(chatId)
  if (!game) throw new Error("Not found")
}

export async function startChatSession({ chatId }: { chatId: string }) {
  await requireGame(chatId)
  return startSession({ chatId })
}

// The transport calls this on 401/403 to refresh the session token
export async function mintChatAccessToken(chatId: string) {
  await requireGame(chatId)
  return triggerAuth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}
