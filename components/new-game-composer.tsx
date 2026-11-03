"use client"

import { useState, useTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { createGame } from "@/lib/games/actions"

export function NewGameComposer() {
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit(value: string) {
    startTransition(async () => {
      // Redirects to the new game on success
      await createGame(value)
    })
  }

  return (
    <ChatComposer
      value={prompt}
      onValueChange={setPrompt}
      onSubmit={submit}
      disabled={isPending}
      placeholder="Describe the game you want to build..."
    />
  )
}
