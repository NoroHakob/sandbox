import { DaytonaConflictError, type Sandbox } from "@daytona/sdk"
import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db, games } from "@/lib/db/client"

export const GAME_DIR = "/home/daytona/game"
const SERVER_LOG = "/tmp/game-server.log"
const HEALTH_CHECK_ATTEMPTS = 20
const HEALTH_CHECK_DELAY_MS = 250

export const PREVIEW_PORT = 3000

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

async function ensureSandboxStarted(sandbox: Sandbox) {
  if (sandbox.state === "stopped" || sandbox.state === "archived") {
    try {
      await sandbox.start()
    } catch (error) {
      // Another request is already starting it, e.g. a Strict Mode double mount
      if (!(error instanceof DaytonaConflictError)) throw error
    }
  }

  await sandbox.waitUntilStarted()
}

async function isGameServerUp(sandbox: Sandbox) {
  const { exitCode } = await sandbox.process.executeCommand(
    `python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${PREVIEW_PORT}/', timeout=2)"`
  )

  return exitCode === 0
}

// Stopping a sandbox kills the server, so this also recovers from auto-stop
export async function startGameServer(sandboxId: string) {
  const sandbox = await daytona.get(sandboxId)

  await ensureSandboxStarted(sandbox)

  if (await isGameServerUp(sandbox)) return sandbox

  await sandbox.process.executeCommand(
    `nohup python3 -m http.server ${PREVIEW_PORT} --directory ${GAME_DIR} >> ${SERVER_LOG} 2>&1 &`
  )

  for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt++) {
    if (await isGameServerUp(sandbox)) return sandbox
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_DELAY_MS))
  }

  throw new Error(`Game server did not start in sandbox ${sandboxId}`)
}
