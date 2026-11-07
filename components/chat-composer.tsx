"use client"

import { ArrowUpIcon, SquareIcon } from "lucide-react"

import { ModelPicker } from "@/components/model-picker"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import type { GameModelId } from "@/lib/games/model-catalog"

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (value: string) => void
  modelId: GameModelId
  onModelChange: (modelId: GameModelId) => void
  disabled?: boolean
  // When set, the send button becomes a stop button that calls it
  onStop?: () => void
  placeholder?: string
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
  modelId,
  onModelChange,
  disabled = false,
  onStop,
  placeholder,
}: ChatComposerProps) {
  const trimmed = value.trim()

  function submit() {
    if (!trimmed || disabled) return
    onSubmit(trimmed)
  }

  return (
    <InputGroup>
      <InputGroupTextarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        disabled={disabled}
      />
      <InputGroupAddon align="block-end">
        <ModelPicker modelId={modelId} onModelChange={onModelChange} />
        {onStop ? (
          <InputGroupButton
            variant="default"
            size="icon-sm"
            className="ml-auto rounded-full"
            aria-label="Stop"
            onClick={onStop}
          >
            <SquareIcon className="fill-current" />
          </InputGroupButton>
        ) : (
          <InputGroupButton
            variant="default"
            size="icon-sm"
            className="ml-auto rounded-full"
            aria-label="Send"
            onClick={submit}
            disabled={!trimmed || disabled}
          >
            <ArrowUpIcon />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
