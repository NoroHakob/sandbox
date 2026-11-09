import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { type StepResult, stepCountIs, streamText, type ToolSet } from "ai"
import { z } from "zod"

import { chargeStep } from "@/lib/billing/ledger"
import { priceUsage } from "@/lib/billing/pricing"
import { createGameSandbox } from "@/lib/daytona/utils"
import { getGameModelSettings } from "@/lib/games/agent"
import {
  getGameMessages,
  getGameOrgId,
  getGameSandboxId,
  saveGameChat,
  saveGameChatAccessToken,
  saveGameMessages,
} from "@/lib/games/chat-store"
import { gameInstructions } from "@/lib/games/instructions"
import {
  type GameModelId,
  gameModelIds,
  resolveGameModelId,
} from "@/lib/games/model-catalog"
import { createGameTools } from "@/lib/games/tools"
import { describeError, elapsed, logger } from "@/lib/observability"

// Optional as a whole: the transport sends no metadata without client data
const clientDataSchema = z
  .object({ modelId: z.enum(gameModelIds).optional() })
  .optional()

// Charges the game's org for one finished step, then tells the client to
// refresh its balance. Never throws: billing must not break a turn
async function chargeGameStep({
  chatId,
  modelId,
  getOrgId,
  step,
}: {
  chatId: string
  modelId: GameModelId
  getOrgId: () => Promise<string | null>
  step: StepResult<ToolSet>
}) {
  const amount = priceUsage(modelId, step.usage)

  try {
    const orgId = await getOrgId()
    if (!orgId) throw new Error(`Game ${chatId} has no org to charge`)

    const charged = await chargeStep({
      orgId,
      responseId: step.response.id,
      amount,
    })
    // Transient: a balance nudge, not part of the stored thread
    if (charged) {
      chat.response.write({ type: "data-credits", data: {}, transient: true })
    }
  } catch (error) {
    logger.error(logger.fmt`Failed to charge step of game ${chatId}`, {
      "game.id": chatId,
      "chat.model": modelId,
      "billing.response_id": step.response.id,
      "billing.amount_nanodollars": amount.toString(),
      ...describeError(error),
    })
  }
}

// The chat id is the game id, and the games row is the source of truth
export const gameChat = chat.agent({
  id: "game-chat",
  clientDataSchema,
  tools: ({ chatId }) => createGameTools(chatId),
  hydrateMessages: async ({
    chatId,
    turn,
    trigger,
    incomingMessages,
    clientData,
  }) => {
    const stored = await getGameMessages(chatId)
    if (!stored) throw new Error(`Game ${chatId} not found`)

    // Before the upsert below, which appends to stored
    logger.info(logger.fmt`Turn ${turn} started for game ${chatId}`, {
      "game.id": chatId,
      "chat.turn": turn,
      "chat.trigger": trigger,
      "chat.model": resolveGameModelId(clientData?.modelId),
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
    clientData,
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
        "chat.model": resolveGameModelId(clientData?.modelId),
        ...describeError(error),
      })
      throw error
    }
  },
  run: async ({ chatId, messages, tools, signal, clientData }) => {
    const modelId = resolveGameModelId(clientData?.modelId)
    // Looked up on the first charge and reused for the turn's later steps.
    // A failed lookup is retried on the next step rather than cached
    let orgId: Promise<string | null> | undefined
    const getOrgId = () =>
      (orgId ??= getGameOrgId(chatId).catch((error: unknown) => {
        orgId = undefined
        throw error
      }))

    return streamText({
      ...chat.toStreamTextOptions({ tools }),
      ...getGameModelSettings(modelId),
      instructions: gameInstructions,
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(40),
      // A whole game file must fit in one write_file call
      maxOutputTokens: 16000,
      onStepFinish: (step) =>
        chargeGameStep({ chatId, modelId, getOrgId, step }),
    })
  },
})
