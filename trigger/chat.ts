import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"
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

// The chat id is the game id, and the games row is the source of truth
export const gameChat = chat.agent({
  id: "game-chat",
  tools: ({ chatId }) => createGameTools(chatId),
  hydrateMessages: async ({ chatId, trigger, incomingMessages }) => {
    const stored = await getGameMessages(chatId)
    if (!stored) throw new Error(`Game ${chatId} not found`)

    // createGame stores the opening prompt and the client replays it to
    // request the first reply, so only append messages the thread lacks
    if (upsertIncomingMessage(stored, { trigger, incomingMessages })) {
      await saveGameMessages(chatId, stored)
    }

    return stored
  },
  onChatStart: async ({ chatId }) => {
    if (!(await getGameSandboxId(chatId))) await createGameSandbox(chatId)
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
    await saveGameChat({
      id: chatId,
      messages: uiMessages,
      chatAccessToken,
      chatLastEventId: lastEventId,
    })
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
