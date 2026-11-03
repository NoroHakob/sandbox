"use server"

import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"
import { auth } from "@clerk/nextjs/server"
import { generateId, generateText } from "ai"
import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { db, games } from "@/lib/db"

export async function createGame(prompt: string) {
  const { userId, orgId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  if (!orgId) throw new Error("No active organization")

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

  // Re-render the (app) layout so the sidebar picks up the new game
  refresh()

  redirect(`/games/${game.id}`)
}

// Best effort: a failed or empty generation returns null so the caller falls back
async function generateTitle(prompt: string) {
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
    console.error("Failed to generate game title", error)
    return null
  }
}

function truncate(text: string) {
  return text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text
}
