"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

import { Spinner } from "@/components/ui/spinner"

// The preview route signs URLs for 60 minutes
const URL_MAX_AGE_MS = 50 * 60 * 1000
const PING_INTERVAL_MS = 1000

// Must match the placeholder and limits in lib/games/runtime/report.js
const GAME_ORIGIN = "https://game"
const gameStatusSchema = z.object({
  type: z.literal("game-status"),
  error: z
    .object({
      message: z.string().max(1000),
      source: z.string().max(1000).nullable(),
      line: z.number().nullable(),
      column: z.number().nullable(),
      stack: z.string().max(2000).nullable(),
    })
    .nullable(),
})

// Drops a URL's query and fragment, keeping the ":line:column" and ")" of a
// stack frame that come after them
const URL_SUFFIX =
  /([a-z][a-z0-9+.-]*:\/\/[^\s?#]+)[?#]\S*?(:\d+(?::\d+)?)?(\)?)(?=\s|$)/gi

// The signed URL is a credential, and its token is in the hostname, so hiding
// the host matters as much as the query
function scrubUrls(text: string, previewUrl: string) {
  const { origin, host } = new URL(previewUrl)

  return text
    .replaceAll(origin, GAME_ORIGIN)
    .replaceAll(host, "game")
    .replace(URL_SUFFIX, "$1$2$3")
}

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
  const iframe = useRef<HTMLIFrameElement>(null)

  const previewUrl = preview?.url
  const previewRevision = preview?.revision

  // Runs per load: a new revision remounts the iframe and restarts the polling
  useEffect(() => {
    if (!previewUrl) return
    const url = previewUrl

    function stop() {
      clearInterval(interval)
      window.removeEventListener("message", onMessage)
    }

    function onMessage(event: MessageEvent) {
      const frame = iframe.current?.contentWindow
      if (!frame || event.source !== frame) return

      const status = gameStatusSchema.safeParse(event.data)
      if (!status.success || !status.data.error) return

      const { message, source, line, column, stack } = status.data.error

      stop()
      Sentry.logger.error("Game error", {
        "game.id": gameId,
        "game.revision": previewRevision,
        message: scrubUrls(message, url),
        stack: stack ? scrubUrls(stack, url) : undefined,
        file: source ? scrubUrls(source, url) : undefined,
        line: line ?? undefined,
        column: column ?? undefined,
      })
    }

    window.addEventListener("message", onMessage)
    // Nothing secret is sent, and the frame's origin changes as it loads
    const interval = setInterval(() => {
      iframe.current?.contentWindow?.postMessage({ type: "game-ping" }, "*")
    }, PING_INTERVAL_MS)

    return stop
  }, [gameId, previewUrl, previewRevision])

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
        ref={iframe}
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
