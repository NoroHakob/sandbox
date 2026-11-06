import { logger } from "@sentry/nextjs"
import type { NextRequest } from "next/server"

import { PREVIEW_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"
import { describeError, elapsed } from "@/lib/observability"

const PREVIEW_TTL_SECONDS = 3600

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/games/[id]/preview">
) {
  const { id } = await ctx.params

  const game = await getGame(id)
  if (!game) {
    logger.warn(logger.fmt`Preview requested for unavailable game ${id}`, {
      "game.id": id,
    })
    return Response.json({ error: "Game not found" }, { status: 404 })
  }
  if (!game.sandboxId) {
    logger.warn(logger.fmt`Preview requested before game ${id} has a sandbox`, {
      "game.id": id,
    })
    return Response.json({ error: "Game has no sandbox" }, { status: 409 })
  }

  const start = performance.now()

  try {
    const { sandbox } = await startGameServer(game.sandboxId)
    // Signed, because an iframe can't send the x-daytona-preview-token header
    const { url } = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      PREVIEW_TTL_SECONDS
    )

    logger.info(logger.fmt`Preview started for game ${id}`, {
      "game.id": id,
      "sandbox.id": game.sandboxId,
      duration_ms: elapsed(start),
    })

    return Response.json({ url })
  } catch (error) {
    logger.error(logger.fmt`Failed to start preview for game ${id}`, {
      "game.id": id,
      "sandbox.id": game.sandboxId,
      duration_ms: elapsed(start),
      ...describeError(error),
    })
    return Response.json({ error: "Failed to start preview" }, { status: 502 })
  }
}
