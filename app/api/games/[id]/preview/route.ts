import type { NextRequest } from "next/server"

import { PREVIEW_PORT, startGameServer } from "@/lib/daytona/utils"
import { getGame } from "@/lib/games/queries"

const PREVIEW_TTL_SECONDS = 3600

export async function GET(
  _request: NextRequest,
  ctx: RouteContext<"/api/games/[id]/preview">
) {
  const { id } = await ctx.params

  const game = await getGame(id)
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 })
  }
  if (!game.sandboxId) {
    return Response.json({ error: "Game has no sandbox" }, { status: 409 })
  }

  try {
    const sandbox = await startGameServer(game.sandboxId)
    // Signed, because an iframe can't send the x-daytona-preview-token header
    const { url } = await sandbox.getSignedPreviewUrl(
      PREVIEW_PORT,
      PREVIEW_TTL_SECONDS
    )

    return Response.json({ url })
  } catch (error) {
    console.error("Failed to start game preview", error)
    return Response.json({ error: "Failed to start preview" }, { status: 502 })
  }
}
