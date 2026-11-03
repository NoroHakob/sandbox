"use client"

import { ArrowUpIcon, ChevronDownIcon, GripHorizontalIcon } from "lucide-react"
import { useState, useTransition } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import { createGame } from "@/lib/games/actions"

const models = ["Kimi K3", "Claude Opus 5.5", "Claude Sonnet 5.5"]

export function ChatComposer() {
  const [prompt, setPrompt] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!prompt.trim() || isPending) return
    startTransition(async () => {
      await createGame(prompt)
      setPrompt("")
    })
  }

  return (
    <InputGroup>
      <InputGroupTextarea
        placeholder="Describe the game you want to build..."
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        disabled={isPending}
      />
      <InputGroupAddon align="block-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={<InputGroupButton variant="ghost" />}>
            <GripHorizontalIcon />
            Kimi K3
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" className="w-auto">
            {models.map((model) => (
              <DropdownMenuItem key={model}>{model}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <InputGroupButton
          variant="default"
          size="icon-sm"
          className="ml-auto rounded-full"
          aria-label="Send"
          onClick={submit}
          disabled={!prompt.trim() || isPending}
        >
          <ArrowUpIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
