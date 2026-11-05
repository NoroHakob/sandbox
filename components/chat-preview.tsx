"use client"

import { useEffect, useRef, useState } from "react"

import { Spinner } from "@/components/ui/spinner"

// The preview route signs URLs for 60 minutes
const URL_MAX_AGE_MS = 50 * 60 * 1000

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
  // Cleared when a load fails, so the next revision fetches a new URL
  const signedUrl = useRef<{ url: string; fetchedAt: number } | null>(null)

  useEffect(() => {
    if (!ready) return

    const controller = new AbortController()

    // Always requested, as the route restarts the server after an auto-stop.
    // The game stays on screen meanwhile, and its URL is reused while it's
    // valid, which keeps the origin and with it the game's localStorage
    async function loadPreview() {
      try {
        const response = await fetch(`/api/games/${gameId}/preview`, {
          signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)

        const stored = signedUrl.current
        const current =
          stored && Date.now() - stored.fetchedAt < URL_MAX_AGE_MS
            ? stored
            : { url: body.url as string, fetchedAt: Date.now() }

        signedUrl.current = current
        setPreview({ url: current.url, revision })
        setError(null)
      } catch (err) {
        if (controller.signal.aborted) return
        signedUrl.current = null
        setError(err instanceof Error ? err.message : "Failed to load preview")
      }
    }

    loadPreview()

    return () => controller.abort()
  }, [gameId, ready, revision])

  if (preview) {
    return (
      <iframe
        // The URL is usually unchanged, so the key is what forces the reload
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
