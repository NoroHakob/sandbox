"use client"

import { useState, useTransition } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { Button } from "@/components/ui/button"
import { createGame } from "@/lib/games/actions"
import { defaultGameModelId, type GameModelId } from "@/lib/games/model-catalog"
import { suggestions } from "@/lib/games/suggestions"

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
    <>
      <ChatComposer
        value={prompt}
        onValueChange={setPrompt}
        onSubmit={submit}
        modelId={modelId}
        onModelChange={setModelId}
        disabled={isPending}
        placeholder="Describe the game you want to build..."
      />
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map(({ icon: Icon, label, prompt: suggestionPrompt }) => (
          <Button
            key={label}
            variant="outline"
            className="rounded-full"
            disabled={isPending}
            onClick={() => submit(suggestionPrompt)}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </>
  )
}
