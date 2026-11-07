"use client"

import { useState, useTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { createGame } from "@/lib/games/actions"
import { defaultGameModelId, type GameModelId } from "@/lib/games/model-catalog"

export function NewGameComposer() {
  const [prompt, setPrompt] = useState("")
  const [modelId, setModelId] = useState<GameModelId>(defaultGameModelId)
  const [isPending, startTransition] = useTransition()

  function submit(value: string) {
    startTransition(async () => {
      // Redirects to the new game on success
      await createGame(value, modelId)
    })
  }

  return (
    <ChatComposer
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={submit}
      modelId={modelId}
      onModelChange={setModelId}
      disabled={isPending}
      placeholder="Describe the game you want to build..."
    />
  )
}
