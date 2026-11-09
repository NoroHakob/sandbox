"use server"

import { auth } from "@clerk/nextjs/server"
import { logger } from "@sentry/nextjs"
import { auth as triggerAuth } from "@trigger.dev/sdk"
import { chat, type InferChatClientData } from "@trigger.dev/sdk/ai"

import { canStartBuild } from "@/lib/billing/gate"
import { getGame } from "@/lib/games/queries"
import { describeError } from "@/lib/observability"
import type { gameChat } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof gameChat>("game-chat")

// The chat id is the game id, so owning the game authorizes the chat
async function requireGame(chatId: string) {
  const { userId } = await auth()
  if (!userId) {
    logger.warn(logger.fmt`Unauthorized chat access to game ${chatId}`, {
      "game.id": chatId,
    })
    throw new Error("Unauthorized")
  }

  const game = await getGame(chatId)
  if (!game) {
    // Also what a game of another organization looks like
    logger.warn(logger.fmt`Chat access to unavailable game ${chatId}`, {
      "game.id": chatId,
    })
    throw new Error("Not found")
  }

  return game
}

export async function startChatSession({
  chatId,
  clientData,
}: {
  chatId: string
  clientData?: InferChatClientData<typeof gameChat>
}) {
  const game = await requireGame(chatId)

  // Starting a session runs the first turn, so an empty org never gets a run.
  // Later turns go straight to the run, which checks again
  if (!(await canStartBuild(game.orgId))) {
    logger.info(
      logger.fmt`Blocked chat session for game ${chatId}: no credits`,
      {
        "game.id": chatId,
        "org.id": game.orgId,
      }
    )
    return { outOfCredits: true } as const
  }

  try {
    return await startSession({ chatId, clientData })
  } catch (error) {
    logger.error(logger.fmt`Failed to start chat session for game ${chatId}`, {
      "game.id": chatId,
      ...describeError(error),
    })
    throw error
  }
}

// The transport calls this on 401/403 to refresh the session token
export async function mintChatAccessToken(chatId: string) {
  await requireGame(chatId)

  try {
    return await triggerAuth.createPublicToken({
      scopes: {
        read: { sessions: chatId },
        write: { sessions: chatId },
      },
      expirationTime: "1h",
    })
  } catch (error) {
    logger.error(logger.fmt`Failed to mint chat token for game ${chatId}`, {
      "game.id": chatId,
      ...describeError(error),
    })
    throw error
  }
}
