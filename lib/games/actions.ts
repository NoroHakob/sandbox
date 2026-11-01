"use server"

import { auth } from "@clerk/nextjs/server"
import { refresh } from "next/cache"

import { db, games } from "@/lib/db"

export async function createGame(prompt: string) {
  const { userId, orgId } = await auth()
  if (!userId) throw new Error("Unauthorized")
  if (!orgId) throw new Error("No active organization")

  const title = prompt.trim()
  if (!title) throw new Error("Prompt is required")

  const [game] = await db
    .insert(games)
    .values({ orgId, title })
    .returning({ id: games.id })

  // Re-render the (app) layout so the sidebar picks up the new game
  refresh()

  return game
}
