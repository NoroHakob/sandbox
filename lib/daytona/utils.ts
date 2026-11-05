import { DaytonaConflictError, type Sandbox } from "@daytona/sdk"
import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db, games } from "@/lib/db/client"
import { readRuntimeFiles } from "@/lib/games/seed"

export const GAME_DIR = "/home/daytona/game"
export const ENGINE_DIR = `${GAME_DIR}/engine`
const SERVER_LOG = "/tmp/game-server.log"
const HEALTH_CHECK_ATTEMPTS = 20
const HEALTH_CHECK_DELAY_MS = 250

export const PREVIEW_PORT = 3000

// Used by the Trigger.dev worker, so this imports "@/lib/db/client" directly
export async function createGameSandbox(gameId: string) {
  const { folders, files } = await readRuntimeFiles(GAME_DIR)
  const sandbox = await daytona.create({ labels: { gameId } })

  await sandbox.fs.createFolder(GAME_DIR, "755")
  for (const folder of folders) await sandbox.fs.createFolder(folder, "755")
  await sandbox.fs.uploadFiles(files)

  await db
    .update(games)
    .set({ sandboxId: sandbox.id })
    .where(eq(games.id, gameId))

  return { sandbox }
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

// A sandbox keeps the engine it was created with, which the instructions may
// have moved past. Only engine/ is copied: the rest belongs to the game
async function syncEngine(sandbox: Sandbox) {
  const { folders, files } = await readRuntimeFiles(GAME_DIR)
  const isEngine = (path: string) =>
    path === ENGINE_DIR || path.startsWith(`${ENGINE_DIR}/`)

  for (const folder of folders.filter(isEngine)) {
    await sandbox.fs.createFolder(folder, "755")
  }
  await sandbox.fs.uploadFiles(
    files.filter(({ destination }) => isEngine(destination))
  )
}

// Older games have no sandbox yet, so one is created for them here. Called once
// per turn, as createGameTools caches the result
export async function getGameSandbox(gameId: string) {
  const [game] = await db
    .select({ sandboxId: games.sandboxId })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1)

  if (!game) throw new Error(`Game ${gameId} not found`)
  if (!game.sandboxId) return createGameSandbox(gameId)

  const sandbox = await daytona.get(game.sandboxId)

  await ensureSandboxStarted(sandbox)
  await syncEngine(sandbox)

  return { sandbox }
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

  if (await isGameServerUp(sandbox)) return { sandbox }

  await sandbox.process.executeCommand(
    `nohup python3 -m http.server ${PREVIEW_PORT} --directory ${GAME_DIR} >> ${SERVER_LOG} 2>&1 &`
  )

  for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt++) {
    if (await isGameServerUp(sandbox)) return { sandbox }
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_DELAY_MS))
  }

  throw new Error(`Game server did not start in sandbox ${sandboxId}`)
}
