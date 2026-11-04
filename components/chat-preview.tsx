"use client"

import { useEffect, useState } from "react"

import { Spinner } from "@/components/ui/spinner"

export function ChatPreview({ gameId }: { gameId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPreview() {
      try {
        const response = await fetch(`/api/games/${gameId}/preview`, {
          signal: controller.signal,
        })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)

        setUrl(body.url)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load preview")
      }
    }

    loadPreview()

    return () => controller.abort()
  }, [gameId])

  if (url) {
    return <iframe src={url} title="Game preview" className="size-full" />
  }

  return (
    <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
      {error ?? (
        <>
          <Spinner />
          Starting preview…
        </>
      )}
    </div>
  )
}
