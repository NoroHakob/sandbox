import "server-only"

import { auth } from "@clerk/nextjs/server"
import type { UIMessage } from "ai"
import { and, desc, eq } from "drizzle-orm"

import { db, games } from "@/lib/db"

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listGames() {
  const { orgId } = await auth()
  if (!orgId) return []

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
}

export async function getGame(id: string) {
  const { orgId } = await auth()
  // Postgres rejects non-uuid input for a uuid column, so treat it as missing
  if (!orgId || !UUID_RE.test(id)) return null

  const [game] = await db
    .select()
    .from(games)
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
    .limit(1)

  return game ?? null
}

// Called from the chat stream's onEnd, after the request scope may be gone, so
// the caller passes the orgId it already authorized
export async function saveGameMessages({
  id,
  orgId,
  messages,
}: {
  id: string
  orgId: string
  messages: UIMessage[]
}) {
  await db
    .update(games)
    .set({ messages })
    .where(and(eq(games.id, id), eq(games.orgId, orgId)))
}
