"use server"

import {
  openai,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai"
import { auth } from "@clerk/nextjs/server"
import { logger } from "@sentry/nextjs"
import { generateId, generateText } from "ai"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { db, games } from "@/lib/db"
import { describeError, elapsed } from "@/lib/observability"

export async function createGame(prompt: string) {
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
    "org.id": orgId,
  })

  // Re-render the (app) layout so the sidebar picks up the new game
  refresh()

  redirect(`/games/${game.id}`)
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
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text
}
