"use client"

import { useEffect, useState } from "react"

import { Spinner } from "@/components/ui/spinner"

export function ChatPreview({
  gameId,
  ready,
  revision,
}: {
  gameId: string
  // A new game has no sandbox until its first turn has started
  ready: boolean
  // Bumped after each turn, to show the files the turn changed
  revision: number
}) {
  const [preview, setPreview] = useState<{
    url: string
    revision: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return

    const controller = new AbortController()

    // Always fetched again, as the sandbox may have stopped and the signed URL
    // expires, while the current game stays on screen until the new one is set
    async function loadPreview() {
      try {
        const response = await fetch(`/api/games/${gameId}/preview`, {
          signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)

        setPreview({ url: body.url, revision })
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load preview")
      }
    }

    loadPreview()

    return () => controller.abort()
  }, [gameId, ready, revision])

  if (preview) {
    return (
      <iframe
        // The URL can be unchanged, so the key is what forces the reload
        key={preview.revision}
        src={preview.url}
        title="Game preview"
        className="size-full"
      />
    )
  }

  return (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      {error ?? (
        <>
          <Spinner />
          {ready ? "Starting preview…" : "Building your game…"}
        </>
      )}
    </div>
  )
}
