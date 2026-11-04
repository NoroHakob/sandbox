import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db, games } from "@/lib/db/client"

const GAME_DIR = "/home/daytona/game"

// Used by the Trigger.dev worker, so this imports "@/lib/db/client" directly
export async function createGameSandbox(gameId: string) {
  const sandbox = await daytona.create()

  await sandbox.fs.createFolder(GAME_DIR, "755")
  await sandbox.fs.uploadFile(Buffer.from("New game"), `${GAME_DIR}/index.html`)

  await db
    .update(games)
    .set({ sandboxId: sandbox.id })
    .where(eq(games.id, gameId))

  return sandbox
}
