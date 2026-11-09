import {
  DaytonaConflictError,
  DaytonaGoneError,
  DaytonaNotFoundError,
  type Sandbox,
} from "@daytona/sdk"
import { eq } from "drizzle-orm"

import { daytona } from "@/lib/daytona/client"
import { db, games } from "@/lib/db/client"
import { readRuntimeFiles } from "@/lib/games/seed"
import { describeError, elapsed, logger } from "@/lib/observability"

export const GAME_DIR = "/home/daytona/game"
export const ENGINE_DIR = `${GAME_DIR}/engine`
export const REPORT_FILE = `${GAME_DIR}/report.js`
const SERVER_LOG = "/tmp/game-server.log"
const HEALTH_CHECK_ATTEMPTS = 20
const HEALTH_CHECK_DELAY_MS = 250
const LOG_TAIL_LINES = 20
const LOG_TAIL_MAX_CHARS = 2000

export const PREVIEW_PORT = 3000

// Used by the Trigger.dev worker, so this imports "@/lib/db/client" directly
export async function createGameSandbox(gameId: string) {
  const start = performance.now()
  const { folders, files } = await readRuntimeFiles(GAME_DIR)
  const sandbox = await daytona.create({ labels: { gameId } })

  await sandbox.fs.createFolder(GAME_DIR, "755")
  for (const folder of folders) await sandbox.fs.createFolder(folder, "755")
  await sandbox.fs.uploadFiles(files)

  await db
    .update(games)
    .set({ sandboxId: sandbox.id })
    .where(eq(games.id, gameId))

  logger.info(logger.fmt`Sandbox ${sandbox.id} created for game ${gameId}`, {
    "game.id": gameId,
    "sandbox.id": sandbox.id,
    "sandbox.seed_files": files.length,
    duration_ms: elapsed(start),
  })

  return { sandbox }
}

// Returns whether the sandbox was idle. Read up front, as start() updates state
async function ensureSandboxStarted(sandbox: Sandbox) {
  const start = performance.now()
  const previousState = sandbox.state
  const wasStopped = previousState === "stopped" || previousState === "archived"

  if (wasStopped) {
    try {
      await sandbox.start()
    } catch (error) {
      // Another request is already starting it, e.g. a Strict Mode double mount
      if (!(error instanceof DaytonaConflictError)) throw error
    }
  }

  await sandbox.waitUntilStarted()

  if (wasStopped) {
    logger.info(logger.fmt`Idle sandbox ${sandbox.id} restarted`, {
      "game.id": sandbox.labels.gameId,
      "sandbox.id": sandbox.id,
      "sandbox.previous_state": previousState,
      duration_ms: elapsed(start),
    })
  }

  return wasStopped
}

// A sandbox keeps the engine it was created with, which the instructions may
// have moved past. Only engine/ and report.js are copied: the rest belongs to
// the game
async function syncEngine(sandbox: Sandbox) {
  const start = performance.now()
  const { folders, files } = await readRuntimeFiles(GAME_DIR)
  const isEngine = (path: string) =>
    path === ENGINE_DIR || path.startsWith(`${ENGINE_DIR}/`)

  for (const folder of folders.filter(isEngine)) {
    await sandbox.fs.createFolder(folder, "755")
  }
  const engineFiles = files.filter(
    ({ destination }) => isEngine(destination) || destination === REPORT_FILE
  )

  await sandbox.fs.uploadFiles(engineFiles)

  logger.info(logger.fmt`Engine synced to sandbox ${sandbox.id}`, {
    "game.id": sandbox.labels.gameId,
    "sandbox.id": sandbox.id,
    "sandbox.engine_files": engineFiles.length,
    duration_ms: elapsed(start),
  })
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

// Deletes every sandbox labeled with the game, plus the stored one in case its
// label is missing. Never throws: the caller decides what a failure means, so
// it gets back the ids that could not be deleted
export async function deleteGameSandboxes(
  gameId: string,
  storedSandboxId: string | null
) {
  const start = performance.now()
  const sandboxes = new Map<string, Sandbox | null>()
  const failed: string[] = []

  try {
    for await (const sandbox of daytona.list({ labels: { gameId } })) {
      sandboxes.set(sandbox.id, sandbox)
    }
  } catch (error) {
    // Without the listing, sandboxes may be left behind: report it as a failure
    logger.error(logger.fmt`Failed to list sandboxes of game ${gameId}`, {
      "game.id": gameId,
      ...describeError(error),
    })
    failed.push(`label:gameId=${gameId}`)
  }
  if (storedSandboxId && !sandboxes.has(storedSandboxId)) {
    sandboxes.set(storedSandboxId, null)
  }

  let deleted = 0
  for (const [sandboxId, listed] of sandboxes) {
    if (listed?.state === "destroyed" || listed?.state === "destroying") continue

    try {
      const sandbox = listed ?? (await daytona.get(sandboxId))
      await daytona.delete(sandbox)
      deleted++
    } catch (error) {
      // Already gone is what we wanted
      if (
        error instanceof DaytonaNotFoundError ||
        error instanceof DaytonaGoneError
      ) {
        continue
      }
      logger.error(logger.fmt`Failed to delete sandbox ${sandboxId}`, {
        "game.id": gameId,
        "sandbox.id": sandboxId,
        ...describeError(error),
      })
      failed.push(sandboxId)
    }
  }

  logger.info(logger.fmt`Sandboxes of game ${gameId} deleted`, {
    "game.id": gameId,
    "sandbox.found": sandboxes.size,
    "sandbox.deleted": deleted,
    "sandbox.failed": failed.length,
    duration_ms: elapsed(start),
  })

  return { failed }
}

async function isGameServerUp(sandbox: Sandbox) {
  const { exitCode } = await sandbox.process.executeCommand(
    `python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${PREVIEW_PORT}/', timeout=2)"`
  )

  return exitCode === 0
}

// Best effort, as it must not replace the error being reported. The log holds
// access lines as well as tracebacks, and a query string is the game's data
async function readServerLogTail(sandbox: Sandbox) {
  try {
    const { result } = await sandbox.process.executeCommand(
      `tail -n ${LOG_TAIL_LINES} ${SERVER_LOG}`
    )

    return result.replace(/\?\S*/g, "").slice(-LOG_TAIL_MAX_CHARS)
  } catch (error) {
    logger.warn(logger.fmt`Failed to read server log of ${sandbox.id}`, {
      "sandbox.id": sandbox.id,
      ...describeError(error),
    })
    return undefined
  }
}

// Stopping a sandbox kills the server, so this also recovers from auto-stop
export async function startGameServer(sandboxId: string) {
  const start = performance.now()
  const sandbox = await daytona.get(sandboxId)
  const wasStopped = await ensureSandboxStarted(sandbox)

  function ready(reused: boolean) {
    logger.info(logger.fmt`Game server ready in sandbox ${sandboxId}`, {
      "game.id": sandbox.labels.gameId,
      "sandbox.id": sandboxId,
      was_stopped: wasStopped,
      reused,
      duration_ms: elapsed(start),
    })

    return { sandbox }
  }

  if (await isGameServerUp(sandbox)) return ready(true)

  await sandbox.process.executeCommand(
    `nohup python3 -m http.server ${PREVIEW_PORT} --directory ${GAME_DIR} >> ${SERVER_LOG} 2>&1 &`
  )

  for (let attempt = 0; attempt < HEALTH_CHECK_ATTEMPTS; attempt++) {
    if (await isGameServerUp(sandbox)) return ready(false)
    await new Promise((resolve) => setTimeout(resolve, HEALTH_CHECK_DELAY_MS))
  }

  logger.error(
    logger.fmt`Game server failed to start in sandbox ${sandboxId}`,
    {
      "game.id": sandbox.labels.gameId,
      "sandbox.id": sandboxId,
      was_stopped: wasStopped,
      health_check_attempts: HEALTH_CHECK_ATTEMPTS,
      duration_ms: elapsed(start),
      server_log_tail: await readServerLogTail(sandbox),
    }
  )

  throw new Error(`Game server did not start in sandbox ${sandboxId}`)
}
