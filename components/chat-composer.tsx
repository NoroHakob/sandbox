"use client"

import {
  ArrowUpIcon,
  ChevronDownIcon,
  GripHorizontalIcon,
  SquareIcon,
} from "lucide-react"

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

const models = ["Kimi K3", "Claude Opus 5.5", "Claude Sonnet 5.5"]

type ChatComposerProps = {
  value: string
  onValueChange: (value: string) => void
  onSubmit: (value: string) => void
  disabled?: boolean
  // When set, the send button becomes a stop button that calls it
  onStop?: () => void
  placeholder?: string
}

export function ChatComposer({
  value,
  onValueChange,
  onSubmit,
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
