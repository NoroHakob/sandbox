import "server-only"

import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"

import { db, games } from "@/lib/db"

export async function listGames() {
  const { orgId } = await auth()
  if (!orgId) return []

  return db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.orgId, orgId))
    .orderBy(desc(games.createdAt))
}
