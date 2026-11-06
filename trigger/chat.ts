import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai"
import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { stepCountIs, streamText } from "ai"

import { createGameSandbox } from "@/lib/daytona/utils"
import {
  getGameMessages,
  getGameSandboxId,
  saveGameChat,
  saveGameChatAccessToken,
  saveGameMessages,
} from "@/lib/games/chat-store"
import { gameInstructions } from "@/lib/games/instructions"
import { createGameTools } from "@/lib/games/tools"
import { describeError, elapsed, logger } from "@/lib/observability"

// The chat id is the game id, and the games row is the source of truth
export const gameChat = chat.agent({
  id: "game-chat",
  tools: ({ chatId }) => createGameTools(chatId),
  hydrateMessages: async ({ chatId, turn, trigger, incomingMessages }) => {
    const stored = await getGameMessages(chatId)
    if (!stored) throw new Error(`Game ${chatId} not found`)

    // Before the upsert below, which appends to stored
    logger.info(logger.fmt`Turn ${turn} started for game ${chatId}`, {
      "game.id": chatId,
      "chat.turn": turn,
      "chat.trigger": trigger,
      "chat.stored_messages": stored.length,
      "chat.incoming_messages": incomingMessages.length,
    })

    // createGame stores the opening prompt and the client replays it to
    // request the first reply, so only append messages the thread lacks
    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await saveGameMessages(chatId, stored)
    }

    return stored
  },
  onChatStart: async ({ chatId }) => {
    if (await getGameSandboxId(chatId)) return

    const start = performance.now()

    try {
      await createGameSandbox(chatId)
    } catch (error) {
      logger.error(logger.fmt`Failed to create sandbox for game ${chatId}`, {
        "game.id": chatId,
        duration_ms: elapsed(start),
        ...describeError(error),
      })
      throw error
    }
  },
  // Store the token before any of the reply reaches the client, so a reload
  // mid-turn (including the first) resumes the stream instead of resending
  onTurnStart: ({ chatId, chatAccessToken }) => {
    chat.deferBeforeOutput(saveGameChatAccessToken(chatId, chatAccessToken))
  },
  onTurnComplete: async ({
    chatId,
    uiMessages,
    chatAccessToken,
    lastEventId,
  }) => {
    try {
      await saveGameChat({
        id: chatId,
        messages: uiMessages,
        chatAccessToken,
        chatLastEventId: lastEventId,
      })
    } catch (error) {
      logger.error(logger.fmt`Failed to save finished turn of game ${chatId}`, {
        "game.id": chatId,
        "chat.message_count": uiMessages.length,
        ...describeError(error),
      })
      throw error
    }
  },
  run: async ({ messages, tools, signal }) =>
    streamText({
      ...chat.toStreamTextOptions({ tools }),
      model: openai("gpt-6-luna"),
      instructions: gameInstructions,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(40),
      // A whole game file must fit in one write_file call
      maxOutputTokens: 16000,
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        } satisfies OpenAILanguageModelResponsesOptions,
      },
    }),
})
