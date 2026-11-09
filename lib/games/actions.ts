"use server"

import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai"
import { auth } from "@clerk/nextjs/server"
import { logger } from "@sentry/nextjs"
import { NotFoundError, runs, sessions } from "@trigger.dev/sdk"
import { generateId, generateText } from "ai"
import { and, eq } from "drizzle-orm"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { deleteGameSandboxes } from "@/lib/daytona/utils"
import { db, games } from "@/lib/db"
import { MAX_TITLE_LENGTH } from "@/lib/games/limits"
import { defaultGameModelId, isGameModelId } from "@/lib/games/model-catalog"
import { getGame } from "@/lib/games/queries"
import { describeError, elapsed } from "@/lib/observability"

export async function createGame(prompt: string, modelId: string) {
  const { userId, orgId } = await auth()
  if (!userId) {
    logger.warn("Unauthorized game creation attempt")
    throw new Error("Unauthorized")
  }
  if (!orgId) {
    logger.warn("Game creation attempt without an active organization")
    throw new Error("No active organization")
  }

  const trimmed = prompt.trim()
  if (!trimmed) throw new Error("Prompt is required")
  if (!isGameModelId(modelId)) throw new Error("Invalid model")

  const title = (await generateTitle(trimmed)) ?? truncate(trimmed)

  const [game] = await db
    .insert(games)
    .values({
      orgId,
      title,
      // The game page sees a trailing user message and requests the reply
      messages: [
        {
          id: generateId(),
          role: "user",
          parts: [{ type: "text", text: trimmed }],
        },
      ],
    })
    .returning({ id: games.id })
    .catch((error) => {
      logger.error("Failed to create game", {
        "org.id": orgId,
        ...describeError(error),
      })
      throw error
    })

  logger.info(logger.fmt`Game ${game.id} created`, {
    "game.id": game.id,
    "game.model": modelId,
    "org.id": orgId,
  })

  // Re-render the (app) layout so the sidebar picks up the new game
  refresh()

  // The first turn runs on the game page, which reads the pick from the URL
  redirect(
    modelId === defaultGameModelId
      ? `/games/${game.id}`
      : `/games/${game.id}?model=${modelId}`
  )
}

// Best effort: a failed or empty generation returns null so the caller falls back
async function generateTitle(prompt: string) {
  const start = performance.now()

  try {
    const { text } = await generateText({
      model: openai("gpt-6-luna"),
      instructions:
        "Write a title for the game described by the user. At most four words, title case, no quotes, no trailing punctuation. Reply with the title only.",
      prompt,
      maxOutputTokens: 20,
      // Reasoning tokens count toward maxOutputTokens and would starve the title
      providerOptions: {
        openai: {
          reasoningEffort: "none",
        } satisfies OpenAILanguageModelResponsesOptions,
      },
    })

    const title = text
      .trim()
      .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
      .replace(/[.!?,;:…]+$/, "")
      .trim()

    return title ? truncate(title) : null
  } catch (error) {
    logger.error("Failed to generate game title", {
      duration_ms: elapsed(start),
      ...describeError(error),
    })
    return null
  }
}

function truncate(text: string) {
  return text.length > MAX_TITLE_LENGTH
    ? `${text.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
    : text
}

// Server actions are reachable by a direct POST, so every one checks that the
// game belongs to the active org before touching it. getGame scopes to the org
async function requireOwnedGame(gameId: string, action: string) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) {
    logger.warn(logger.fmt`Unauthorized ${action} attempt on game ${gameId}`, {
      "game.id": gameId,
    })
    throw new Error("Unauthorized")
  }

  const game = await getGame(gameId)
  if (!game) {
    // Also what a game of another organization looks like
    logger.warn(logger.fmt`${action} attempt on unavailable game ${gameId}`, {
      "game.id": gameId,
      "org.id": orgId,
    })
    throw new Error("Not found")
  }

  return game
}

export async function renameGame(gameId: string, title: string) {
  const game = await requireOwnedGame(gameId, "rename")

  // Expected failures come back as values: Next hides thrown messages in prod
  const trimmed = typeof title === "string" ? title.trim() : ""
  if (!trimmed) return { error: "Enter a name." }
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return { error: `Keep the name under ${MAX_TITLE_LENGTH} characters.` }
  }

  await db
    .update(games)
    .set({ title: trimmed })
    .where(and(eq(games.id, game.id), eq(games.orgId, game.orgId)))
    .catch((error) => {
      logger.error(logger.fmt`Failed to rename game ${game.id}`, {
        "game.id": game.id,
        "org.id": game.orgId,
        ...describeError(error),
      })
      throw error
    })

  logger.info(logger.fmt`Game ${game.id} renamed`, {
    "game.id": game.id,
    "org.id": game.orgId,
  })

  // Re-render the header and the sidebar with the new title
  refresh()
  return { error: null }
}

// Closes the game's chat session and cancels its live run, so no turn keeps
// working on (or creating a sandbox for) a game that is going away. Throws if
// the session can't be closed, which stops the delete
async function stopGameChat(gameId: string) {
  let currentRunId: string | null | undefined
  try {
    ;({ currentRunId } = await sessions.close(gameId, {
      reason: "game deleted",
    }))
  } catch (error) {
    // The game never started a chat
    if (error instanceof NotFoundError) return
    logger.error(logger.fmt`Failed to close chat session of game ${gameId}`, {
      "game.id": gameId,
      ...describeError(error),
    })
    throw error
  }
  if (!currentRunId) return

  try {
    const run = await runs.retrieve(currentRunId)
    if (!run.isCompleted) await runs.cancel(currentRunId)
  } catch (error) {
    // The closed session already tells the run to exit, and the final sandbox
    // sweep catches anything it created meanwhile
    logger.warn(logger.fmt`Failed to cancel chat run of game ${gameId}`, {
      "game.id": gameId,
      "trigger.run_id": currentRunId,
      ...describeError(error),
    })
  }
}

// Credit ledger rows stay: they belong to the org, not the game
export async function deleteGame(
  gameId: string,
  { redirectHome }: { redirectHome: boolean }
) {
  const start = performance.now()
  const game = await requireOwnedGame(gameId, "delete")
  const attributes = { "game.id": game.id, "org.id": game.orgId }

  try {
    await stopGameChat(game.id)
  } catch {
    // Logged in stopGameChat. A live turn could still create a sandbox
    return { error: "Couldn't stop the game's chat. Try again." }
  }

  // Keep the row while a sandbox survives, so the delete can be retried and
  // nothing is left running without a game pointing at it
  const before = await deleteGameSandboxes(game.id, game.sandboxId)
  if (before.failed.length > 0) {
    logger.error(
      logger.fmt`Kept game ${game.id}: ${before.failed.length} sandboxes could not be deleted`,
      { ...attributes, "sandbox.failed_ids": before.failed.join(",") }
    )
    return { error: "Couldn't delete the game's sandbox. Try again." }
  }

  await db
    .delete(games)
    .where(and(eq(games.id, game.id), eq(games.orgId, game.orgId)))
    .catch((error) => {
      logger.error(logger.fmt`Failed to delete game ${game.id}`, {
        ...attributes,
        ...describeError(error),
      })
      throw error
    })

  // A turn that was mid-flight may have created a sandbox since the first sweep
  const after = await deleteGameSandboxes(game.id, null)
  if (after.failed.length > 0) {
    // The row is gone, so these ids in the log are all that points at them
    logger.error(
      logger.fmt`Game ${game.id} deleted, but ${after.failed.length} sandboxes created meanwhile could not be deleted`,
      { ...attributes, "sandbox.failed_ids": after.failed.join(",") }
    )
  }

  logger.info(logger.fmt`Game ${game.id} deleted`, {
    ...attributes,
    duration_ms: elapsed(start),
  })

  // Re-render the (app) layout so the sidebar drops the game. Only the page
  // that showed the game goes home; any other page stays where it is
  refresh()
  if (redirectHome === true) redirect("/")
  return { error: null }
}
