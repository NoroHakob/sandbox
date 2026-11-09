import { chat, upsertIncomingMessage } from "@trigger.dev/sdk/ai"
import { type StepResult, stepCountIs, streamText, type ToolSet } from "ai"
import { z } from "zod"

import { canStartBuild } from "@/lib/billing/gate"
import { chargeStep } from "@/lib/billing/ledger"
import { OUT_OF_CREDITS_PART } from "@/lib/billing/out-of-credits"
import { priceUsage } from "@/lib/billing/pricing"
import { createGameSandbox } from "@/lib/daytona/utils"
import { getGameModelSettings } from "@/lib/games/agent"
import {
  getGameMessages,
  getGameOrgId,
  getGameSandboxId,
  saveGameChat,
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

// Whether this turn may build. Checked once at the start of the turn and never
// between steps, so a build already running finishes even below zero. Never
// throws: an unknown org lets the turn run, and its charges log the problem
async function canBuildTurn({
  chatId,
  getOrgId,
}: {
  chatId: string
  getOrgId: () => Promise<string | null>
}) {
  let orgId: string | null
  try {
    orgId = await getOrgId()
  } catch (error) {
    logger.error(logger.fmt`Failed to look up the org of game ${chatId}`, {
      "game.id": chatId,
      ...describeError(error),
    })
    return true
  }
  if (!orgId) return true

  const allowed = await canStartBuild(orgId)
  if (!allowed) {
    logger.info(logger.fmt`Blocked a turn of game ${chatId}: no credits`, {
      "game.id": chatId,
      "org.id": orgId,
    })
  }

  return allowed
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
  // Store the thread and token before any of the reply reaches the client, so
  // a reload mid-turn (including the first) resumes the stream instead of
  // resending. The thread carries this turn's merged input, such as an
  // ask_player answer, which would otherwise wait for onTurnComplete and be
  // asked again after a reload. The stored cursor is left at the previous
  // turn's end, so the resumed stream replays this whole turn
  onTurnStart: ({ chatId, uiMessages, chatAccessToken }) => {
    chat.deferBeforeOutput(
      saveGameChat({ id: chatId, messages: uiMessages, chatAccessToken }).catch(
        (error: unknown) => {
          logger.error(
            logger.fmt`Failed to save started turn of game ${chatId}`,
            {
              "game.id": chatId,
              "chat.message_count": uiMessages.length,
              ...describeError(error),
            }
          )
        }
      )
    )
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

    // Nothing to answer: the thread already ends on a reply, as when it was
    // submitted twice or a tab requests a reply it already got. Generate and
    // charge nothing. An answered ask_player ends on a tool message, not here
    if (messages.at(-1)?.role === "assistant") {
      logger.warn(
        logger.fmt`Skipped turn of game ${chatId}: thread ends on a reply`,
        {
          "game.id": chatId,
          "chat.model": modelId,
          "chat.message_count": messages.length,
        }
      )
      return
    }

    // Looked up on the first charge and reused for the turn's later steps.
    // A failed lookup is retried on the next step rather than cached
    let orgId: Promise<string | null> | undefined
    const getOrgId = () =>
      (orgId ??= getGameOrgId(chatId).catch((error: unknown) => {
        orgId = undefined
        throw error
      }))

    // Reply with a notice instead of calling the model. It is saved with the
    // thread like any reply, so a reload still shows why nothing was built
    if (!(await canBuildTurn({ chatId, getOrgId }))) {
      chat.response.write({ type: OUT_OF_CREDITS_PART, data: {} })
      return
    }

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
